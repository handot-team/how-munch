'use client';

import { useEffect, useRef, useState } from 'react';

import { format } from 'date-fns';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Camera, ChevronLeft, ImagePlus, Loader2, ReceiptText, Sparkles } from 'lucide-react';
import { AppScreen } from '@stackflow/plugin-basic-ui';

import { cn } from '@/commons/lib';
import { Button, CTAButton, Toast } from '@/commons/ui';

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
  const [preview, setPreview] = useState<string | null>(null);
  const [payload, setPayload] = useState<ImagePayload | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    function revokePreviewOnChange() {
      if (!preview) return;
      return () => URL.revokeObjectURL(preview);
    },
    [preview],
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

  async function selectImage(file: File | undefined) {
    if (!file) return;
    try {
      const { base64, mimeType } = await compressReceiptImage(file);
      setPreview(URL.createObjectURL(file));
      setPayload({ base64, mimeType });
      setErrorMessage('');
      setStatus('ready');
    } catch {
      Toast.error('이미지를 불러오지 못했어요. 다른 사진을 선택해 주세요.');
    }
  }

  async function analyze() {
    if (!payload) return;
    setStepIndex(0);
    setStatus('analyzing');
    try {
      const { items } = await parseReceipt.mutateAsync({
        imageBase64: payload.base64,
        mimeType: payload.mimeType,
        categories,
        today: format(new Date(), 'yyyy-MM-dd'),
      });
      // 영수증 줄은 담기 목록에 더한다(직접 입력으로 담은 줄과 같은 목록).
      addItems(items.map((item) => ({ ...item, source: 'receipt' as const })));
      onParsed(items);
      resetTimerRef.current = setTimeout(() => {
        setStatus('idle');
        setPreview(null);
        setPayload(null);
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
        className="hidden"
        onChange={(e) => {
          void selectImage(e.target.files?.[0]);
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
          void selectImage(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div className="flex flex-col gap-6 px-4 pt-6 pb-32">
        {status === 'idle' ? (
          <IdleView onOpenGallery={openGallery} onOpenCamera={openCamera} />
        ) : (
          <ScanView
            status={status}
            preview={preview}
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
        disabled={!payload}
      >
        <Sparkles className="size-4" />
        {status === 'error' ? '다시 분석하기' : '분석하기'}
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
  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="text-xl font-bold tracking-tight text-gray-900">영수증을 올려주세요</h1>
        <p className="text-sm leading-relaxed text-gray-500">
          사진 한 장이면 AI가 품목·가격·수량을
          <br />
          자동으로 정리해드려요.
        </p>
      </header>

      <button
        type="button"
        onClick={onOpenGallery}
        className={cn(
          'group relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 px-6 py-14',
          'transition-colors active:bg-emerald-50',
        )}
      >
        <span className="pointer-events-none absolute -top-10 -right-8 size-32 rounded-full bg-emerald-100/60 blur-2xl" />
        <span className="pointer-events-none absolute -bottom-12 -left-10 size-36 rounded-full bg-emerald-100/40 blur-2xl" />
        <span className="relative flex size-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-emerald-100">
          <ReceiptText className="size-8 text-emerald-600" strokeWidth={1.6} />
        </span>
        <span className="relative flex flex-col items-center gap-0.5">
          <span className="text-sm font-semibold text-gray-800">탭해서 사진 선택</span>
          <span className="text-xs text-gray-400">영수증 · 장보기 목록 이미지</span>
        </span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" color="primary" onClick={onOpenCamera}>
          <Camera className="size-4" />
          사진 촬영
        </Button>
        <Button type="button" variant="outline" color="primary" onClick={onOpenGallery}>
          <ImagePlus className="size-4" />
          앨범에서 선택
        </Button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Scan — 프리뷰 / 분석중 / 에러
 * -----------------------------------------------------------------------------------------------*/

interface ScanViewProps {
  status: Exclude<Status, 'idle'>;
  preview: string | null;
  stepIndex: number;
  errorMessage: string;
  reduceMotion: boolean;
  onReselect: () => void;
}

/**
 * @description 스캔 화면 상태(ready/analyzing/error)에 맞는 제목·설명 문구를 반환한다.
 */
function resolveScanCopy(status: Exclude<Status, 'idle'>): { title: string; desc: string } {
  if (status === 'analyzing') {
    return { title: '영수증을 읽고 있어요', desc: '잠시만 기다려 주세요.' };
  }
  if (status === 'error') {
    return { title: '분석에 실패했어요', desc: '사진이 선명한지 확인하고 다시 시도해 주세요.' };
  }
  return { title: '이 영수증이 맞나요?', desc: '맞으면 아래에서 분석을 시작해요.' };
}

function ScanView({
  status,
  preview,
  stepIndex,
  errorMessage,
  reduceMotion,
  onReselect,
}: ScanViewProps) {
  const isAnalyzing = status === 'analyzing';
  const isError = status === 'error';
  const copy = resolveScanCopy(status);

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
