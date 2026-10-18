'use client';

import { useEffect, useRef, useState } from 'react';

import { format } from 'date-fns';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Camera, ChevronLeft, ImagePlus, Loader2 } from 'lucide-react';
import { AppScreen } from '@stackflow/plugin-basic-ui';

import { cn } from '@/commons/lib';
import { Button, CTAButton, CTAConfirmButton, Toast } from '@/commons/ui';

import { useIngredientCategoriesQuery } from '@/entities/ingredient-category';

import { useParseReceiptMutation } from '../api/mutations';
import { compressReceiptImage } from '../lib/compressReceiptImage';
import { type StagedItem } from '../lib/parseAiResponse';
import { usePromptIngredientStore } from '../model/promptIngredientStore';

interface PromptIngredientAddScreenProps {
  onClose: () => void;
  onParsed: (items: StagedItem[]) => void;
  householdId: string;
}

type Status = 'idle' | 'ready' | 'analyzing' | 'error';

interface ImagePayload {
  base64: string;
  mimeType: string;
}

const PREVIEW_HEIGHT = 360;

const ANALYZING_STEPS = [
  '품목을 인식하고 있어요',
  '가격과 수량을 정리하고 있어요',
  '카테고리를 분류하고 있어요',
];

export function PromptIngredientAddScreen({
  onClose,
  onParsed,
  householdId,
}: PromptIngredientAddScreenProps) {
  const reduceMotion = useReducedMotion();
  const addItems = usePromptIngredientStore((s) => s.addItems);
  const { data: categories = [] } = useIngredientCategoriesQuery(householdId);
  const parseReceipt = useParseReceiptMutation();

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<Status>('idle');
  // 시안 v5: 앨범에서 영수증 여러 장을 한 번에 고른다. 사진 찍기는 한 장씩이다.
  const [previews, setPreviews] = useState<string[]>([]);
  const [payloads, setPayloads] = useState<ImagePayload[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    function revokePreviewOnChange() {
      return () => previews.forEach((url) => URL.revokeObjectURL(url));
    },
    [previews],
  );

  useEffect(function clearResetTimerOnUnmount() {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  useEffect(
    function cycleAnalyzingSteps() {
      if (status !== 'analyzing' || reduceMotion) return;
      const id = setInterval(() => {
        setStepIndex((i) => (i + 1) % ANALYZING_STEPS.length);
      }, 1600);
      return () => clearInterval(id);
    },
    [status, reduceMotion],
  );

  async function selectImages(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    try {
      const next = await Promise.all(files.map((file) => compressReceiptImage(file)));
      setPreviews(files.map((file) => URL.createObjectURL(file)));
      setPayloads(next.map(({ base64, mimeType }) => ({ base64, mimeType })));
      setErrorMessage('');
      setStatus('ready');
    } catch {
      Toast.error('이미지를 불러오지 못했어요. 다른 사진을 선택해 주세요.');
    }
  }

  async function analyze() {
    if (payloads.length === 0) return;
    setStepIndex(0);
    setStatus('analyzing');
    try {
      // 영수증마다 따로 읽어 같은 목록에 붙인다. 가게·날짜가 달라 목록에서는 영수증마다 묶음 머리가 하나씩 생긴다.
      const all: StagedItem[] = [];
      for (const payload of payloads) {
        const { items } = await parseReceipt.mutateAsync({
          imageBase64: payload.base64,
          mimeType: payload.mimeType,
          categories,
          today: format(new Date(), 'yyyy-MM-dd'),
        });
        all.push(...items);
      }
      addItems(all.map((item) => ({ ...item, source: 'receipt' as const })));
      onParsed(all);
      resetTimerRef.current = setTimeout(() => {
        setStatus('idle');
        setPreviews([]);
        setPayloads([]);
        setErrorMessage('');
      }, 2000);
    } catch (err) {
      // 사용자에겐 친화적 message를, 콘솔엔 실제 원인(cause)을 남긴다
      console.error('[receipt-parse]', err instanceof Error ? (err.cause ?? err) : err);
      setErrorMessage(err instanceof Error ? err.message : '영수증 분석에 실패했어요.');
      setStatus('error');
    }
  }

  function openGallery() {
    galleryInputRef.current?.click();
  }

  function openCamera() {
    cameraInputRef.current?.click();
  }

  const showCTA = status === 'ready' || status === 'error';
  let analyzeLabel = payloads.length > 1 ? `${payloads.length}장 분석하기` : '분석하기';
  if (status === 'error') analyzeLabel = '다시 분석하기';

  return (
    <AppScreen
      className="pointer-events-auto"
      appBar={{
        title: '영수증 업로드',
        backButton: {
          render: () => (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="뒤로가기"
              disabled={status === 'analyzing'}
            >
              <ChevronLeft className="size-5" />
            </Button>
          ),
        },
      }}
    >
      {/* 숨겨진 파일 입력 */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void selectImages(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void selectImages(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="flex flex-col gap-6 px-4 pt-6 pb-32">
        {status === 'idle' ? (
          <IdleView onOpenGallery={openGallery} onOpenCamera={openCamera} />
        ) : (
          <ScanView
            status={status}
            previews={previews}
            stepIndex={stepIndex}
            errorMessage={errorMessage}
            reduceMotion={Boolean(reduceMotion)}
            onReselect={openGallery}
          />
        )}
      </div>

      <CTAButton
        type="button"
        open={showCTA}
        color="confirm"
        variant="filled"
        onClick={analyze}
        containerClassName="pb-[max(env(safe-area-inset-bottom),20px)] bg-white"
        disabled={payloads.length === 0}
      >
        {analyzeLabel}
      </CTAButton>
    </AppScreen>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Idle — 업로드 대기
 * -----------------------------------------------------------------------------------------------*/

interface IdleViewProps {
  onOpenGallery: () => void;
  onOpenCamera: () => void;
}

function IdleView({ onOpenGallery, onOpenCamera }: IdleViewProps) {
  // 시안 v4: 점선·그라데이션 업로드 상자를 없앴다. 안내 글은 왼쪽 위(Z 패턴 시작)에 두고,
  // 누를 버튼은 엄지가 편한 아래에 TDS 두 버튼 하단 CTA처럼 [앨범에서 선택(보조, 왼쪽) | 사진 찍기(주, 오른쪽)]로 둔다.
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-[22px] leading-snug font-bold text-[#191F28]">영수증을 올려 주세요</h1>
        <p className="text-[15px] leading-relaxed text-[#4E5968]">
          여러 장이면 앨범에서 한 번에 골라 주세요.
        </p>
      </header>

      {/* 시안 v5: 두 버튼은 앱 공용 두 버튼 하단 CTA(TDS FixedBottomCTA.Double에 대응). 왼쪽 약한 버튼, 오른쪽 주 버튼. */}
      <CTAConfirmButton containerClassName="pb-[max(env(safe-area-inset-bottom),20px)] bg-white">
        <CTAConfirmButton.Left
          type="button"
          variant="subtle"
          color="cancel"
          onClick={onOpenGallery}
        >
          <ImagePlus className="size-5" />
          앨범에서 선택
        </CTAConfirmButton.Left>
        <CTAConfirmButton.Right type="button" onClick={onOpenCamera}>
          <Camera className="size-5" />
          사진 찍기
        </CTAConfirmButton.Right>
      </CTAConfirmButton>
    </>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Scan — 프리뷰 / 분석중 / 에러
 * -----------------------------------------------------------------------------------------------*/

interface ScanViewProps {
  status: Exclude<Status, 'idle'>;
  previews: string[];
  stepIndex: number;
  errorMessage: string;
  reduceMotion: boolean;
  onReselect: () => void;
}

/**
 * @description 스캔 화면 상태(ready/analyzing/error)에 맞는 제목·설명 문구를 반환한다.
 */
function resolveScanCopy(
  status: Exclude<Status, 'idle'>,
  count: number,
): { title: string; desc: string } {
  if (status === 'analyzing') {
    return { title: '영수증을 읽고 있어요', desc: '잠시만 기다려 주세요.' };
  }
  if (status === 'error') {
    return { title: '분석에 실패했어요', desc: '사진이 선명한지 확인하고 다시 시도해 주세요.' };
  }
  if (count > 1) {
    return {
      title: `영수증 ${count}장이 맞나요?`,
      desc: '영수증마다 따로 읽어 같은 목록에 담아요.',
    };
  }
  return { title: '이 영수증이 맞나요?', desc: '맞으면 아래에서 분석을 시작해요.' };
}

function ScanView({
  status,
  previews,
  stepIndex,
  errorMessage,
  reduceMotion,
  onReselect,
}: ScanViewProps) {
  const isAnalyzing = status === 'analyzing';
  const isError = status === 'error';
  const copy = resolveScanCopy(status, previews.length);
  const preview = previews[0] ?? null;

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="text-xl font-bold tracking-tight text-gray-900">{copy.title}</h1>
        <p className="text-sm leading-relaxed text-gray-500">{copy.desc}</p>
      </header>

      <div
        className="relative w-full overflow-hidden rounded-3xl border border-gray-200 bg-gray-50 shadow-sm"
        style={{ height: PREVIEW_HEIGHT }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- 로컬 blob objectURL 미리보기라 next/image 최적화 대상이 아님
          <img
            src={preview}
            alt="선택한 영수증"
            className={cn(
              'h-full w-full object-cover object-top transition-[filter] duration-300',
              isAnalyzing && 'brightness-[0.97]',
            )}
          />
        ) : null}

        {/* 스캔 라인 오버레이 */}
        {isAnalyzing && !reduceMotion ? (
          <motion.div
            aria-hidden
            className="absolute inset-x-0"
            initial={{ y: -48 }}
            animate={{ y: PREVIEW_HEIGHT }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          >
            <div className="h-12 bg-gradient-to-b from-emerald-300/0 to-emerald-300/40" />
            <div className="h-[2px] bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,0.6)]" />
          </motion.div>
        ) : null}

        {/* 감속 모드: 정적 스피너 오버레이 */}
        {isAnalyzing && reduceMotion ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/40">
            <Loader2 className="size-7 animate-spin text-emerald-500" />
          </div>
        ) : null}
      </div>

      {previews.length > 1 ? (
        <div className="flex gap-2">
          {previews.map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- 로컬 blob objectURL 미리보기
            <img
              key={url}
              src={url}
              alt={`영수증 ${index + 1}`}
              className={cn(
                'size-16 rounded-xl object-cover object-top',
                index === 0 && 'ring-2 ring-[#191F28]',
              )}
            />
          ))}
        </div>
      ) : null}

      {isAnalyzing ? (
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-emerald-700">
          <Loader2 className="size-4 animate-spin" />
          <AnimatePresence mode="wait">
            <motion.span
              key={stepIndex}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              {ANALYZING_STEPS[stepIndex]}
            </motion.span>
          </AnimatePresence>
        </div>
      ) : null}

      {isError ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-600">
          {errorMessage}
        </p>
      ) : null}

      {!isAnalyzing ? (
        <button
          type="button"
          onClick={onReselect}
          className="self-center text-sm font-medium text-gray-500 underline underline-offset-4 active:text-gray-700"
        >
          다른 사진 선택
        </button>
      ) : null}
    </>
  );
}
