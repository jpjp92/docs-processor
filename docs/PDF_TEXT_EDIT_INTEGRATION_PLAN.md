# PDF Text Edit Integration Plan

## Goal

현재 실험 중인 PDF content stream 치환 기능을 프로젝트의 베타 기능으로 연결한다.

목표는 범용 PDF 편집기가 아니라, 사용자가 선택한 PDF 영역 안에서 기존 텍스트 객체를 감지하고 조건이 맞을 때만 원본 스타일을 유지한 채 치환하는 것이다.

## Non-goals

- 워드프로세서처럼 자유롭게 문단을 편집하지 않는다.
- 스캔 PDF/OCR PDF의 실제 텍스트 객체 수정을 보장하지 않는다.
- 기존 폰트에 없는 글자를 강제로 같은 텍스트 객체에 삽입하지 않는다.
- PDF 전체 레이아웃 재조판을 하지 않는다.

## Current Lab Result

실험 스크립트:

- `scripts/pdf-selection-replace-lab.mjs`

HTML 테스트 파일:

- `tmp/pdf-text-object-lab/selection-replace-lab.html`

성공한 테스트:

```bash
npm run pdf:selection-replace-lab -- replace \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서.pdf" \
  "tmp/pdf-text-object-lab/test-replace-title-ai.pdf" \
  10 \
  "인공지능 " \
  "공공지능 " \
  --all-layers
```

결과:

- matched runs: `19`
- updated run pattern: `1`
- 기존 폰트, 크기, 좌표 패턴, 반복 레이어를 유지

실패한 테스트:

```bash
npm run pdf:selection-replace-lab -- replace \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서.pdf" \
  "tmp/pdf-text-object-lab/test-replace-title-missing-glyph.pdf" \
  10 \
  "산업인프라 " \
  "테스트중입 " \
  --all-layers
```

결과:

```text
Missing glyph(s) in /F2: 테, 스, 트, 중, 입
```

의미:

- 같은 글리프 수라도 기존 폰트에 없는 글자는 직접 치환할 수 없다.
- 이 경우 embedded font overlay 방식으로 분기해야 한다.

## Main App Integration Status

현재 메인 프로젝트에 1차 베타 기능을 적용했다.

추가된 파일:

- `lib/pdf-edit/selection-replace.ts`
- `app/api/pdf-edit/inspect/route.ts`
- `app/api/pdf-edit/replace/route.ts`

수정된 파일:

- `components/pdf-workspace.tsx`
- `app/globals.css`

적용 범위:

- 오른쪽 패널 상단에 `PDF 텍스트 치환 실험` 패널 추가
- 현재 페이지의 반복 text run 후보 찾기
- 후보 선택
- 새 텍스트 입력
- 글리프 수 일치 여부 표시
- 서버 API를 통한 수정 PDF 다운로드

아직 적용하지 않은 범위:

- 드래그한 선택 영역 좌표 기반 후보 필터링
- 기존 폰트에 없는 글자에 대한 embedded font overlay fallback
- 수정된 PDF를 현재 뷰어에 즉시 다시 로드하는 흐름

## Product Scope

초기 기능명:

```text
PDF 원본 텍스트 치환 실험
```

사용자에게 표시할 설명:

```text
선택한 영역의 PDF 내부 텍스트 객체를 감지해 기존 스타일로 치환합니다.
일부 PDF와 일부 글자만 지원됩니다.
```

지원 조건:

- PDF가 실제 텍스트 객체를 포함한다.
- 선택 영역과 겹치는 text run을 찾을 수 있다.
- 해당 text run의 폰트에 ToUnicode 매핑이 있다.
- 치환 텍스트의 글리프 수가 기존 run과 같다.
- 새 글자가 같은 폰트의 역매핑에 존재한다.

미지원 조건:

- 스캔 이미지 PDF
- glyph/ToUnicode 매핑이 없는 PDF
- 기존 폰트에 없는 글자로 치환
- 긴 문장으로 인한 줄바꿈/재조판
- 여러 text run을跨는 자유 편집

## Architecture

### Library Layer

실험 스크립트의 핵심 로직을 `lib/pdf-edit/`로 분리한다.

예상 파일:

```text
lib/pdf-edit/pdf-objects.ts
lib/pdf-edit/font-map.ts
lib/pdf-edit/text-runs.ts
lib/pdf-edit/incremental-update.ts
lib/pdf-edit/selection-replace.ts
```

역할:

- PDF object 탐색
- stream decode/encode
- ToUnicode CMap 파싱
- page resources/content 탐색
- text run 추출
- 선택 좌표와 text run 매칭
- replacement 검증
- incremental update PDF 생성

### API Layer

#### `POST /api/pdf-edit/inspect`

입력:

```ts
{
  file: File;
  pageIndex: number;
  pageObjectId?: number;
  selection?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

출력:

```ts
{
  candidates: Array<{
    id: string;
    text: string;
    font: string;
    fontSize: number;
    glyphCount: number;
    layerCount: number;
    bounds: {
      xMin: number;
      yMin: number;
      xMax: number;
      yMax: number;
    };
    canReplace: boolean;
  }>;
}
```

#### `POST /api/pdf-edit/apply`

입력:

```ts
{
  file: File;
  pageIndex: number;
  pageObjectId?: number;
  candidateId: string;
  replacementText: string;
  allLayers: boolean;
}
```

출력:

- `application/pdf`
- 수정된 PDF binary

실패 응답:

```ts
{
  error: string;
  reason:
    | "NO_TEXT_RUN"
    | "GLYPH_COUNT_MISMATCH"
    | "MISSING_GLYPH"
    | "UNSUPPORTED_PDF"
    | "STREAM_UPDATE_FAILED";
  details?: unknown;
}
```

## UI Flow

1. 사용자가 PDF를 불러온다.
2. `텍스트 수정 실험` 토글을 켠다.
3. PDF 위에서 영역을 드래그한다.
4. 오른쪽 패널에 감지된 텍스트 후보를 표시한다.
5. 사용자가 후보를 선택한다.
6. 새 텍스트를 입력한다.
7. 클라이언트가 치환 가능 여부를 표시한다.
8. `수정 PDF 다운로드` 버튼을 누른다.
9. 서버가 새 PDF를 반환하고 브라우저가 다운로드한다.

UI 상태:

- 후보 없음
- 치환 가능
- 글리프 수 불일치
- 기존 폰트에 없는 글자
- PDF 저장 완료
- PDF 저장 실패

## Browser-only Lab vs App Integration

현재 HTML 랩:

- 원본 PDF를 HTML 안에 base64로 포함
- 브라우저 `CompressionStream("deflate")`로 stream 재압축
- 새 content stream object와 xref를 append
- 다운로드까지 가능

프로젝트 통합 시:

- HTML에 PDF 전체를 심지 않는다.
- 서버 API에서 PDF binary를 받고 처리한다.
- 브라우저는 파일 업로드, 후보 표시, 다운로드만 담당한다.

이유:

- HTML에 PDF를 심으면 파일이 커진다.
- 브라우저별 압축 API 지원 차이가 있다.
- PDF 파싱/검증은 서버에서 처리하는 편이 안정적이다.

## Verification Plan

### Lab Verification

```bash
npm run pdf:selection-replace-lab -- inspect \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서.pdf" \
  10 \
  "tmp/pdf-text-object-lab/selection-replace-lab.html"
```

기대:

- HTML 생성
- text run 후보 생성
- `수정 PDF 다운로드` 버튼 포함

```bash
npm run pdf:selection-replace-lab -- replace \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서.pdf" \
  "tmp/pdf-text-object-lab/test-replace-title-use.pdf" \
  10 \
  "활용 " \
  "수용 " \
  --all-layers
```

기대:

- matched runs: `19`
- output PDF 생성

### App Verification

통합 후 확인:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

수동 확인:

- PDF 업로드
- 선택 영역 드래그
- 후보 목록 표시
- 가능한 치환 다운로드
- 불가능한 치환 에러 메시지 표시
- 기존 AI 분석 기능 영향 없음

## Risks

가장 큰 위험:

- 화면 선택 좌표와 PDF 내부 text run 좌표 매칭이 문서마다 다를 수 있다.

대응:

- 초기에는 후보 전체를 표시하고 사용자가 직접 고르게 한다.
- 이후 selection bounds 기반 필터링을 추가한다.

두 번째 위험:

- 일부 PDF는 xref stream/object stream을 사용해 현재 incremental update 방식이 깨질 수 있다.

대응:

- 지원 가능한 전통 xref table PDF부터 명시적으로 처리한다.
- 실패 시 overlay 방식 또는 미지원 메시지로 분기한다.

세 번째 위험:

- 기존 폰트에 없는 글자 요청이 많을 수 있다.

대응:

- direct replacement와 embedded font overlay를 기능적으로 분리한다.
- UI에서 “원본 폰트 치환”과 “새 글자 덮어쓰기” 차이를 명확히 표시한다.

## Implementation Phases

### Phase 1. Library extraction

- `scripts/pdf-selection-replace-lab.mjs`에서 순수 로직을 `lib/pdf-edit/`로 이동
- CLI 스크립트는 새 라이브러리를 호출하도록 변경
- 기존 lab 테스트를 유지

완료 기준:

- 기존 CLI 명령이 동일하게 동작
- lint/type/build 통과

상태:

- `lib/pdf-edit/selection-replace.ts`로 서버용 핵심 로직 분리 완료
- CLI 스크립트는 아직 기존 독립 구현 유지

### Phase 2. Inspect API

- PDF 업로드를 받아 후보 text run 반환
- page index/object id 처리
- selection bounds 필터는 옵션으로 시작

완료 기준:

- 테스트 PDF에서 11개 후보 반환
- 실패 PDF에서 명확한 에러 반환

상태:

- `POST /api/pdf-edit/inspect` 추가 완료
- 테스트 PDF 1페이지에서 11개 후보 반환 확인

### Phase 3. Replace API

- candidate와 replacement text를 받아 PDF binary 반환
- glyph count/missing glyph 검증
- all-layers 치환 옵션 지원

완료 기준:

- `인공지능 ` -> `공공지능 ` 치환 PDF 반환
- `테스트중입 ` 요청 시 `MISSING_GLYPH` 반환

상태:

- `POST /api/pdf-edit/replace` 추가 완료
- 공백 없는 후보 `파악` -> `수요` HTTP 200 및 PDF 반환 확인
- `테스트중입 ` 요청은 현재 curl 테스트에서 trailing space 전달 한계 때문에 `GLYPH_COUNT_MISMATCH` 확인

### Phase 4. UI integration

- PDF workspace에 `텍스트 수정 실험` 토글 추가
- 영역 선택 후 후보 표시
- 치환 가능 여부 실시간 표시
- 수정 PDF 다운로드 버튼 추가

완료 기준:

- 기존 분석 플로우와 충돌 없음
- 데스크톱/모바일 레이아웃이 깨지지 않음

상태:

- 오른쪽 패널에 베타 UI 적용 완료
- 현재 페이지 후보 찾기와 수정 PDF 다운로드 연결 완료

### Phase 5. Overlay fallback

- 기존 폰트에 없는 글자를 embedded font overlay로 처리
- 사용자가 direct replacement와 overlay fallback 차이를 확인 후 선택

완료 기준:

- `테스트중입니다` 같은 새 한글 문자열도 다운로드 가능
- 결과 PDF의 폰트 embedding 크기와 렌더링 확인
