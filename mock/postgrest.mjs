// PostgREST 요청을 SQL로 옮겨 PGlite에서 실행한다.
// 앱이 실제로 쓰는 문법만 다룬다: select(별칭·embedded), eq/neq/gt/gte/lt/lte/like/ilike/is/in/cs,
// not/or/and, order, limit/offset, count, insert/upsert/update/delete, rpc, single/maybeSingle.

const OBJECT_MEDIA_TYPE = 'application/vnd.pgrst.object+json';
const RESERVED_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const OPERATORS = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'like',
  ilike: 'ilike',
  cs: '@>',
  cd: '<@',
};

class PostgrestError extends Error {
  constructor(status, body) {
    super(body.message);
    this.status = status;
    this.body = body;
  }
}

const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

/**
 * @description DB 카탈로그에서 테이블 컬럼, 외래 키, 함수 시그니처를 읽어 둔다.
 */
export async function loadSchema(db) {
  const columns = await db.query(`
    select c.relname as table_name, a.attname as column_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r', 'v')
    order by c.relname, a.attnum`);
  const foreignKeys = await db.query(`
    select con.conname as name,
      src.relname as table_name,
      ref.relname as ref_table,
      array(select attname from unnest(con.conkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum order by ord) as columns,
      array(select attname from unnest(con.confkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum order by ord) as ref_columns
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace rn on rn.oid = ref.relnamespace
    where con.contype = 'f' and con.connamespace = 'public'::regnamespace and rn.nspname = 'public'`);
  const primaryKeys = await db.query(`
    select c.relname as table_name,
      array(select attname from unnest(con.conkey) k(attnum)
            join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as columns
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    where con.contype = 'p' and con.connamespace = 'public'::regnamespace`);
  const functions = await db.query(`
    select p.proname as name, p.proretset as returns_set,
      t.typname as return_type, t.typtype as return_typtype,
      coalesce(p.proargnames, '{}') as arg_names,
      coalesce(p.proargmodes::text[], '{}') as arg_modes,
      array(select format_type(x, null) from unnest(p.proargtypes) x) as arg_types,
      p.pronargdefaults as default_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public'`);

  const tables = new Map();
  for (const row of columns.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, []);
    tables.get(row.table_name).push(row.column_name);
  }

  const rpc = new Map();
  for (const row of functions.rows) {
    // proargnames에는 OUT 인자도 섞여 있어 IN 인자만 남긴다.
    const inNames = row.arg_names.filter(
      (_, index) => !row.arg_modes[index] || ['i', 'b', 'v'].includes(row.arg_modes[index]),
    );
    const args = inNames.map((name, index) => ({ name, type: row.arg_types[index] }));
    const requiredCount = args.length - row.default_count;
    if (!rpc.has(row.name)) rpc.set(row.name, []);
    rpc.get(row.name).push({
      args,
      required: args.slice(0, requiredCount).map((arg) => arg.name),
      returnsSet: row.returns_set,
      returnType: row.return_type,
      returnsComposite: row.return_typtype === 'c' || row.return_type === 'record',
    });
  }

  return {
    tables,
    foreignKeys: foreignKeys.rows,
    primaryKeys: new Map(primaryKeys.rows.map((row) => [row.table_name, row.columns])),
    rpc,
  };
}

// ---------------------------------------------------------------------------
// 파서
// ---------------------------------------------------------------------------

/** 괄호와 큰따옴표 안의 쉼표는 건너뛰고 최상위 쉼표로만 나눈다. */
function splitTopLevel(input) {
  const parts = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '\\' && quoted) {
      current += char + (input[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (!quoted && char === '(') depth += 1;
    if (!quoted && char === ')') depth -= 1;
    if (!quoted && depth === 0 && char === ',') {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.length > 0) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function unquote(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return value;
}

/** select 문자열을 컬럼/embedded 노드 트리로 바꾼다. */
function parseSelect(input) {
  const source = input && input.trim() ? input : '*';
  return splitTopLevel(source).map((item) => {
    const open = item.indexOf('(');
    if (open === -1) {
      if (item === '*') return { kind: 'star' };
      const [aliasPart, columnPart] = item.includes(':') ? item.split(':') : [null, item];
      const column = columnPart.split('::')[0].trim();
      return { kind: 'column', column, alias: (aliasPart ?? column).trim() };
    }
    const head = item.slice(0, open);
    const body = item.slice(open + 1, item.lastIndexOf(')'));
    const [aliasPart, relationPart] = head.includes(':') ? head.split(':') : [null, head];
    const [relation, ...hints] = relationPart.trim().split('!');
    return {
      kind: 'embed',
      relation: relation.trim(),
      alias: (aliasPart ?? relation).trim(),
      hint: hints.find((hint) => hint !== 'inner' && hint !== 'left') ?? null,
      inner: hints.includes('inner'),
      children: parseSelect(body),
    };
  });
}

/** `op.value`, `not.op.value` 꼴의 필터 값을 조건 하나로 바꾼다. */
function parseCondition(column, expression) {
  let negate = false;
  let rest = expression;
  if (rest.startsWith('not.')) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf('.');
  const operator = dot === -1 ? rest : rest.slice(0, dot);
  const value = dot === -1 ? '' : rest.slice(dot + 1);
  return { kind: 'condition', column, operator, value, negate };
}

/** or=(a.eq.1,and(b.gt.2,c.is.null)) 같은 논리식을 트리로 바꾼다. */
function parseLogic(kind, body, negate = false) {
  const inner = body.startsWith('(') ? body.slice(1, -1) : body;
  const children = splitTopLevel(inner).map((part) => {
    const match = /^(not\.)?(and|or)\((.*)\)$/s.exec(part);
    if (match) return parseLogic(match[2], `(${match[3]})`, Boolean(match[1]));
    const dot = part.indexOf('.');
    return parseCondition(part.slice(0, dot), part.slice(dot + 1));
  });
  return { kind, children, negate };
}

function parseFilters(searchParams) {
  const filters = [];
  for (const [key, value] of searchParams.entries()) {
    if (RESERVED_PARAMS.has(key)) continue;
    // embedded 테이블 필터(dishes.name=...)는 앱에서 쓰지 않아 받지 않는다.
    if (key === 'or' || key === 'and') {
      filters.push(parseLogic(key, value));
      continue;
    }
    if (key === 'not.or' || key === 'not.and') {
      filters.push(parseLogic(key.slice(4), value, true));
      continue;
    }
    if (key.includes('.')) continue;
    filters.push(parseCondition(key, value));
  }
  return filters;
}

function parseOrder(value) {
  if (!value) return [];
  return splitTopLevel(value).map((part) => {
    const [column, ...modifiers] = part.split('.');
    return {
      column,
      descending: modifiers.includes('desc'),
      nulls: modifiers.includes('nullsfirst')
        ? 'first'
        : modifiers.includes('nullslast')
          ? 'last'
          : null,
    };
  });
}

function parsePrefer(header) {
  const prefer = {};
  for (const part of (header ?? '').split(',')) {
    const [key, value] = part.trim().split('=');
    if (key) prefer[key] = value ?? true;
  }
  return prefer;
}

// ---------------------------------------------------------------------------
// SQL 만들기
// ---------------------------------------------------------------------------

class SqlBuilder {
  constructor() {
    this.params = [];
    this.aliasCount = 0;
  }

  param(value) {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  nextAlias() {
    const alias = `t${this.aliasCount}`;
    this.aliasCount += 1;
    return alias;
  }
}

function toPgArrayLiteral(values) {
  const items = values.map((item) => {
    if (item === null || item === undefined) return 'NULL';
    if (Array.isArray(item)) return toPgArrayLiteral(item);
    const text = typeof item === 'object' ? JSON.stringify(item) : String(item);
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  });
  return `{${items.join(',')}}`;
}

function conditionSql(builder, alias, condition) {
  if (condition.kind === 'and' || condition.kind === 'or') {
    const joined = condition.children
      .map((child) => conditionSql(builder, alias, child))
      .join(condition.kind === 'and' ? ' and ' : ' or ');
    const sql = `(${joined || 'true'})`;
    return condition.negate ? `not ${sql}` : sql;
  }

  const column = `${alias}.${quoteIdent(condition.column)}`;
  const { operator } = condition;
  const value = unquote(condition.value);
  let sql;

  if (operator === 'is') {
    const literal = { null: 'null', true: 'true', false: 'false', unknown: 'unknown' }[
      value.toLowerCase()
    ];
    if (!literal) throw badRequest(`is 값이 잘못됐습니다: ${value}`);
    sql = `${column} is ${literal}`;
  } else if (operator === 'in') {
    const list = splitTopLevel(value.replace(/^\(/, '').replace(/\)$/, '')).map(unquote);
    sql = list.length === 0 ? 'false' : `${column} = any(${builder.param(toPgArrayLiteral(list))})`;
  } else if (operator === 'like' || operator === 'ilike') {
    sql = `${column} ${operator} ${builder.param(value.replace(/\*/g, '%'))}`;
  } else if (OPERATORS[operator]) {
    sql = `${column} ${OPERATORS[operator]} ${builder.param(value)}`;
  } else {
    throw badRequest(`지원하지 않는 연산자입니다: ${operator}`);
  }

  return condition.negate ? `not (${sql})` : sql;
}

function whereSql(builder, alias, filters) {
  if (filters.length === 0) return '';
  return ` where ${filters.map((filter) => conditionSql(builder, alias, filter)).join(' and ')}`;
}

function orderSql(alias, order) {
  if (order.length === 0) return '';
  const parts = order.map((item) => {
    const nulls = item.nulls ? ` nulls ${item.nulls}` : '';
    return `${alias}.${quoteIdent(item.column)} ${item.descending ? 'desc' : 'asc'}${nulls}`;
  });
  return ` order by ${parts.join(', ')}`;
}

/** 부모와 자식 테이블 사이의 외래 키를 찾아 방향(배열/객체)을 정한다. */
function resolveRelationship(schema, parentTable, node) {
  const matches = (fk) => !node.hint || fk.name === node.hint || fk.columns.includes(node.hint);

  const toOne = schema.foreignKeys.filter(
    (fk) => fk.table_name === parentTable && fk.ref_table === node.relation && matches(fk),
  );
  const toMany = schema.foreignKeys.filter(
    (fk) => fk.table_name === node.relation && fk.ref_table === parentTable && matches(fk),
  );

  if (toOne.length + toMany.length === 0) {
    throw new PostgrestError(400, {
      code: 'PGRST200',
      message: `'${parentTable}'와 '${node.relation}' 사이 관계를 찾지 못했습니다.`,
      details: null,
      hint: null,
    });
  }
  if (toOne.length + toMany.length > 1) {
    throw new PostgrestError(300, {
      code: 'PGRST201',
      message: `'${parentTable}'와 '${node.relation}' 사이 관계가 여러 개입니다.`,
      details: null,
      hint: '!<외래 키 컬럼>으로 고르세요.',
    });
  }
  if (toOne.length === 1) return { many: false, fk: toOne[0] };
  return { many: true, fk: toMany[0] };
}

function selectListSql(builder, schema, table, alias, nodes) {
  const parts = [];
  for (const node of nodes) {
    if (node.kind === 'star') {
      parts.push(`${alias}.*`);
      continue;
    }
    if (node.kind === 'column') {
      parts.push(`${alias}.${quoteIdent(node.column)} as ${quoteIdent(node.alias)}`);
      continue;
    }
    const { many, fk } = resolveRelationship(schema, table, node);
    const childAlias = builder.nextAlias();
    const childList = selectListSql(builder, schema, node.relation, childAlias, node.children);
    const join = fk.columns
      .map((column, index) =>
        many
          ? `${childAlias}.${quoteIdent(column)} = ${alias}.${quoteIdent(fk.ref_columns[index])}`
          : `${childAlias}.${quoteIdent(fk.ref_columns[index])} = ${alias}.${quoteIdent(column)}`,
      )
      .join(' and ');
    const inner = `select ${childList} from public.${quoteIdent(node.relation)} ${childAlias} where ${join}`;
    const sql = many
      ? `(select coalesce(json_agg(e), '[]'::json) from (${inner}) e)`
      : `(select row_to_json(e) from (${inner} limit 1) e)`;
    parts.push(`${sql} as ${quoteIdent(node.alias)}`);
  }
  return parts.join(', ') || `${alias}.*`;
}

function badRequest(message) {
  return new PostgrestError(400, { code: 'PGRST100', message, details: null, hint: null });
}

function ensureTable(schema, table) {
  if (!schema.tables.has(table)) {
    throw new PostgrestError(404, {
      code: '42P01',
      message: `relation "public.${table}" does not exist`,
      details: null,
      hint: null,
    });
  }
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

/** 요청자 역할과 JWT sub를 트랜잭션 안에 넣고 SQL을 돌린다. RLS는 실제 정책이 그대로 걸린다. */
async function runAsRole(db, claims, work) {
  return db.transaction(async (tx) => {
    const role = claims.role === 'authenticated' ? 'authenticated' : 'anon';
    await tx.exec(`set local role ${role}`);
    await tx.query(
      `select set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claim.role', $2, true),
              set_config('request.jwt.claims', $3, true)`,
      [claims.sub ?? '', role, JSON.stringify(claims)],
    );
    return work(tx);
  });
}

function toPostgrestError(error) {
  if (error instanceof PostgrestError) return error;
  const code = error.code ?? 'XX000';
  const status =
    code === '23505' || code === '23503'
      ? 409
      : code === '42501'
        ? 403
        : code === '42883' || code === '42P01'
          ? 404
          : code === 'PGRST116'
            ? 406
            : 400;
  return new PostgrestError(status, {
    code,
    message: error.message,
    details: error.detail ?? null,
    hint: error.hint ?? null,
  });
}

function shapeRows(rows, wantsObject) {
  if (!wantsObject) return { status: 200, body: rows };
  if (rows.length !== 1) {
    throw new PostgrestError(406, {
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
      details: `The result contains ${rows.length} rows`,
      hint: null,
    });
  }
  return { status: 200, body: rows[0] };
}

async function handleRead(tx, schema, table, url, headers, method) {
  const builder = new SqlBuilder();
  const alias = builder.nextAlias();
  const nodes = parseSelect(url.searchParams.get('select'));
  const list = selectListSql(builder, schema, table, alias, nodes);
  const filters = parseFilters(url.searchParams);
  const where = whereSql(builder, alias, filters);
  const order = orderSql(alias, parseOrder(url.searchParams.get('order')));
  const limit = url.searchParams.get('limit');
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const paging = `${limit ? ` limit ${Number(limit)}` : ''}${offset ? ` offset ${offset}` : ''}`;

  const result = await tx.query(
    `select coalesce(json_agg(x), '[]'::json) as data from (select ${list} from public.${quoteIdent(table)} ${alias}${where}${order}${paging}) x`,
    builder.params,
  );
  const rows = result.rows[0].data;

  const prefer = parsePrefer(headers.get('prefer'));
  let total = '*';
  if (prefer.count) {
    const countBuilder = new SqlBuilder();
    const countAlias = countBuilder.nextAlias();
    const countWhere = whereSql(countBuilder, countAlias, filters);
    const count = await tx.query(
      `select count(*)::int as count from public.${quoteIdent(table)} ${countAlias}${countWhere}`,
      countBuilder.params,
    );
    total = count.rows[0].count;
  }

  const rangeEnd = rows.length === 0 ? '*' : `${offset}-${offset + rows.length - 1}`;
  const responseHeaders = { 'content-range': `${rangeEnd}/${total}` };
  if (method === 'HEAD') return { status: 200, body: null, headers: responseHeaders };

  const wantsObject = (headers.get('accept') ?? '').includes(OBJECT_MEDIA_TYPE);
  return { ...shapeRows(rows, wantsObject), headers: responseHeaders };
}

async function returnRepresentation(tx, schema, table, url, headers, mutationSql, params, status) {
  const prefer = parsePrefer(headers.get('prefer'));
  if (prefer.return !== 'representation') {
    await tx.query(mutationSql, params);
    return { status: status === 201 ? 201 : 204, body: null };
  }
  const builder = new SqlBuilder();
  builder.params = [...params];
  const alias = builder.nextAlias();
  const list = selectListSql(
    builder,
    schema,
    table,
    alias,
    parseSelect(url.searchParams.get('select')),
  );
  const result = await tx.query(
    `with r as (${mutationSql}) select coalesce(json_agg(x), '[]'::json) as data from (select ${list} from r ${alias}) x`,
    builder.params,
  );
  const wantsObject = (headers.get('accept') ?? '').includes(OBJECT_MEDIA_TYPE);
  const shaped = shapeRows(result.rows[0].data, wantsObject);
  return { ...shaped, status };
}

async function handleInsert(tx, schema, table, url, headers, payload) {
  const rows = Array.isArray(payload) ? payload : [payload];
  const columnsParam = url.searchParams.get('columns');
  const columns = columnsParam
    ? columnsParam.split(',').map((column) => column.replace(/"/g, '').trim())
    : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const known = schema.tables.get(table);
  const unknown = columns.filter((column) => !known.includes(column));
  if (unknown.length > 0) {
    throw new PostgrestError(400, {
      code: 'PGRST204',
      message: `Could not find the '${unknown[0]}' column of '${table}' in the schema cache`,
      details: null,
      hint: null,
    });
  }

  const prefer = parsePrefer(headers.get('prefer'));
  const quotedColumns = columns.map(quoteIdent).join(', ');
  let conflict = '';
  if (prefer.resolution) {
    const target = url.searchParams.get('on_conflict')?.split(',') ??
      schema.primaryKeys.get(table) ?? ['id'];
    const targetSql = target.map((column) => quoteIdent(column.trim())).join(', ');
    const updatable = columns.filter((column) => !target.includes(column));
    conflict =
      prefer.resolution === 'ignore-duplicates' || updatable.length === 0
        ? ` on conflict (${targetSql}) do nothing`
        : ` on conflict (${targetSql}) do update set ${updatable
            .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
            .join(', ')}`;
  }

  const sql = `insert into public.${quoteIdent(table)} (${quotedColumns})
    select ${quotedColumns} from json_populate_recordset(null::public.${quoteIdent(table)}, $1::json)${conflict}
    returning *`;
  return returnRepresentation(tx, schema, table, url, headers, sql, [JSON.stringify(rows)], 201);
}

async function handleUpdate(tx, schema, table, url, headers, payload) {
  const builder = new SqlBuilder();
  const body = builder.param(JSON.stringify(payload));
  const alias = 'u0';
  const columns = Object.keys(payload);
  if (columns.length === 0) throw badRequest('바꿀 값이 없습니다.');
  const where = whereSql(builder, alias, parseFilters(url.searchParams));
  const sql = `update public.${quoteIdent(table)} ${alias} set ${columns
    .map((column) => `${quoteIdent(column)} = p.${quoteIdent(column)}`)
    .join(
      ', ',
    )} from json_populate_record(null::public.${quoteIdent(table)}, ${body}::json) p${where} returning ${alias}.*`;
  return returnRepresentation(tx, schema, table, url, headers, sql, builder.params, 200);
}

async function handleDelete(tx, schema, table, url, headers) {
  const builder = new SqlBuilder();
  const alias = 'd0';
  const where = whereSql(builder, alias, parseFilters(url.searchParams));
  const sql = `delete from public.${quoteIdent(table)} ${alias}${where} returning ${alias}.*`;
  return returnRepresentation(tx, schema, table, url, headers, sql, builder.params, 200);
}

function rpcArgument(builder, arg, value) {
  if (value === null || value === undefined) return `${builder.param(null)}::${arg.type}`;
  if (arg.type.endsWith('[]')) {
    return `${builder.param(toPgArrayLiteral(Array.isArray(value) ? value : [value]))}::${arg.type}`;
  }
  if (arg.type === 'json' || arg.type === 'jsonb') {
    return `${builder.param(JSON.stringify(value))}::${arg.type}`;
  }
  return `${builder.param(typeof value === 'object' ? JSON.stringify(value) : String(value))}::${arg.type}`;
}

async function handleRpc(tx, schema, name, url, headers, payload) {
  const candidates = schema.rpc.get(name) ?? [];
  const provided = Object.keys(payload ?? {});
  const fn = candidates.find(
    (candidate) =>
      provided.every((key) => candidate.args.some((arg) => arg.name === key)) &&
      candidate.required.every((key) => provided.includes(key)),
  );
  if (!fn) {
    throw new PostgrestError(404, {
      code: 'PGRST202',
      message: `Could not find the function public.${name}(${provided.join(', ')}) in the schema cache`,
      details: null,
      hint: null,
    });
  }

  const builder = new SqlBuilder();
  const args = fn.args
    .filter((arg) => provided.includes(arg.name))
    .map((arg) => `${quoteIdent(arg.name)} => ${rpcArgument(builder, arg, payload[arg.name])}`)
    .join(', ');
  const call = `public.${quoteIdent(name)}(${args})`;

  if (fn.returnType === 'void') {
    await tx.query(`select ${call}`, builder.params);
    return { status: 204, body: null };
  }

  if (fn.returnsSet) {
    const alias = builder.nextAlias();
    const nodes = parseSelect(url.searchParams.get('select'));
    const filters = parseFilters(url.searchParams);
    const where = whereSql(builder, alias, filters);
    const order = orderSql(alias, parseOrder(url.searchParams.get('order')));
    const limit = url.searchParams.get('limit');
    const list = fn.returnsComposite
      ? nodes.every((node) => node.kind !== 'embed')
        ? nodes
            .map((node) =>
              node.kind === 'star'
                ? `${alias}.*`
                : `${alias}.${quoteIdent(node.column)} as ${quoteIdent(node.alias)}`,
            )
            .join(', ')
        : `${alias}.*`
      : `${alias} as value`;
    const result = await tx.query(
      `select coalesce(json_agg(${fn.returnsComposite ? 'x' : 'x.value'}), '[]'::json) as data from (select ${list} from ${call} ${alias}${where}${order}${limit ? ` limit ${Number(limit)}` : ''}) x`,
      builder.params,
    );
    const wantsObject = (headers.get('accept') ?? '').includes(OBJECT_MEDIA_TYPE);
    return shapeRows(result.rows[0].data, wantsObject);
  }

  const sql = fn.returnsComposite
    ? `select to_json(r) as data from ${call} r`
    : `select to_json(${call}) as data`;
  const result = await tx.query(sql, builder.params);
  return { status: 200, body: result.rows[0]?.data ?? null };
}

/**
 * @description /rest/v1 요청 하나를 처리해 { status, body, headers }를 돌려준다.
 */
export async function handlePostgrest({ db, schema, claims, request }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/rest\/v1\/?/, '');
  const method = request.method.toUpperCase();
  const text = method === 'GET' || method === 'HEAD' ? '' : await request.text();
  const payload = text ? JSON.parse(text) : {};

  try {
    return await runAsRole(db, claims, async (tx) => {
      if (path.startsWith('rpc/')) {
        const name = path.slice(4);
        const args = method === 'GET' ? Object.fromEntries(url.searchParams.entries()) : payload;
        return handleRpc(tx, schema, name, url, request.headers, args);
      }

      const table = decodeURIComponent(path);
      ensureTable(schema, table);
      if (method === 'GET' || method === 'HEAD') {
        return handleRead(tx, schema, table, url, request.headers, method);
      }
      if (method === 'POST') return handleInsert(tx, schema, table, url, request.headers, payload);
      if (method === 'PATCH') return handleUpdate(tx, schema, table, url, request.headers, payload);
      if (method === 'DELETE') return handleDelete(tx, schema, table, url, request.headers);
      throw badRequest(`지원하지 않는 메서드입니다: ${method}`);
    });
  } catch (error) {
    const postgrestError = toPostgrestError(error);
    return { status: postgrestError.status, body: postgrestError.body };
  }
}
