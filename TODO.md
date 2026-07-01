# TODO

## High Priority

### OpenAI summary streaming route

- [ ] `gpt-5.4*` 계열의 일반 호출과 스트리밍 호출 경로를 일관되게 정리한다.
- [ ] `streamOpenAI()`가 모델 정책을 `callOpenAI()`와 공유하도록 만든다.
- [ ] 또는 문서 전체 요약은 Gemini 기본 모델로 고정하고, UI 선택 모델을 넘기지 않는 정책으로 단순화한다.
- [x] Gemini 요약 출력 한도를 `8,192` 토큰으로 올려 긴 요약이 중간에 끊기는 문제를 완화한다.
- [x] SSE parser가 마지막 `data:` 조각을 버리지 않도록 trailing buffer 처리를 추가한다.
- [ ] 관련 파일:
  - `lib/providers.ts`
  - `hooks/use-summary.ts`
  - `app/api/summarize/route.ts`

현재 리스크:

- `callOpenAI()`는 `gpt-5.4*`를 Responses API로 보내지만, `streamOpenAI()`는 Chat Completions API를 사용한다.
- 사용자가 PDF 설정에서 OpenAI `gpt-5.4-mini` 또는 `gpt-5.4`를 선택한 뒤 전체 요약을 실행하면 모델/API 경로가 맞지 않을 수 있다.

완료된 완화:

- Gemini/GPT 공통 SSE parser에서 마지막 payload 누락 가능성을 줄였다.
- `/api/summarize`의 출력 한도를 `8,192` 토큰으로 올렸다.

### Safe Markdown rendering

- [ ] Refine 화면의 Markdown 렌더링을 sanitize 처리한다.
- [ ] PDF 분석과 Refine이 같은 safe renderer를 쓰도록 공용 모듈로 정리한다.
- [ ] 가능하면 `dangerouslySetInnerHTML` 사용 지점을 한 곳으로 줄인다.
- [ ] 관련 파일:
  - `components/refine-workspace.tsx`
  - `components/clip-card.tsx`
  - `lib/pdf-workspace/format.ts`

현재 리스크:

- Refine은 `marked.parse()` 결과를 sanitize 없이 `dangerouslySetInnerHTML`에 넣는다.
- PDF 분석 쪽 renderer는 escape 기반이라 상대적으로 안전하지만, 두 화면의 Markdown 처리 결과가 서로 다르다.

### AI model configuration single source

- [ ] 프로바이더/모델 옵션/기본 모델/비활성 프로바이더 정보를 단일 모듈로 합친다.
- [ ] 추천 파일명 후보: `lib/ai-models.ts`
- [ ] PDF 설정 모달과 Refine 모델 선택 UI가 같은 모델 옵션을 참조하도록 변경한다.
- [ ] 관련 파일:
  - `lib/providers.ts`
  - `lib/pdf-workspace/constants.ts`
  - `components/settings-modal.tsx`
  - `components/refine-workspace.tsx`
  - `hooks/use-ai-settings.ts`
  - `app/api/config/route.ts`

현재 리스크:

- Gemini/OpenAI 모델 목록이 여러 파일에 중복되어 있다.
- 모델을 추가/삭제할 때 한쪽 UI만 바뀌는 누락이 생기기 쉽다.

## Medium Priority

### Shared DOCX Markdown renderer

- [ ] PDF 리포트와 Refine 문서 생성에 쓰는 Markdown to DOCX 변환 로직을 공용화한다.
- [ ] 추천 파일명 후보:
  - `lib/docx/markdown.ts`
  - `lib/docx/styles.ts`
- [ ] 공용화 대상:
  - `<br>`/인라인 HTML 정규화
  - inline bold/italic/code 파싱
  - heading/list/quote/table/code block 변환
  - numbering 설정
- [ ] 관련 파일:
  - `lib/pdf-workspace/docx-report.ts`
  - `lib/refine/md2docx.ts`

현재 리스크:

- `<br>` 같은 문서 변환 버그가 한쪽에서만 고쳐질 수 있다.
- PDF DOCX와 Refine DOCX의 Markdown 지원 범위가 조금씩 달라질 수 있다.

### Split `PdfWorkspace`

- [ ] `components/pdf-workspace.tsx`를 역할별 hook/component로 분리한다.
- [ ] 추천 분리 단위:
  - `usePdfDocument()` PDF 로딩, reset, object URL 관리
  - `usePdfRenderer()` canvas/text layer 렌더링
  - `usePdfSelection()` 드래그 선택, clip capture, 텍스트 추출
  - `useClipAnalysis()` AI 분석 요청과 thread 관리
  - `PdfViewer`, `PdfSidebar`, `PdfInspector`
- [ ] 관련 파일:
  - `components/pdf-workspace.tsx`

현재 리스크:

- 한 파일에 PDF 로딩, 렌더링, selection, AI 요청, export UI가 모두 섞여 있다.
- 작은 UI 수정도 PDF 렌더링/분석 로직을 함께 건드리게 된다.

### Split `RefineWorkspace`

- [ ] `components/refine-workspace.tsx`를 workflow hook과 UI 컴포넌트로 분리한다.
- [ ] 추천 분리 단위:
  - `useRefineConfig()` 서버 키/프로바이더/모델 상태
  - `useRefineImages()` 이미지 읽기, 추가, 삭제, reset
  - `useRefinePipeline()` OCR, 통합 검토, 보강, docx 생성
  - `RefineControls`, `RefinePipeline`, `RefineOutput`
- [ ] 관련 파일:
  - `components/refine-workspace.tsx`

현재 리스크:

- 600라인 이상 컴포넌트에 상태, API, 파이프라인, 렌더링이 모두 섞여 있다.
- RECITATION 재시도, 문서 보강, UI 상태 표시가 같은 함수에 몰려 있다.

## Low Priority

### CSS modularization

- [ ] `app/globals.css`를 화면 또는 도메인별 CSS 파일로 분리한다.
- [ ] 추천 분리 단위:
  - launcher
  - pdf workspace
  - refine workspace
  - modal/shared controls
- [ ] 관련 파일:
  - `app/globals.css`

현재 상태:

- `globals.css`가 약 2,700라인이다.
- 작은 UI 조정도 전체 CSS에서 위치를 찾기 어렵다.

### PDF render race hardening

- [ ] 페이지/줌 변경 시 이전 렌더 작업이 늦게 끝나도 최신 화면을 덮지 않도록 보호한다.
- [ ] `renderJobIdRef` 또는 pdf.js render task cancel을 적용한다.
- [ ] 관련 파일:
  - `components/pdf-workspace.tsx`

현재 리스크:

- 빠르게 페이지 이동 또는 줌 변경을 반복하면 오래 걸린 이전 렌더가 나중에 반영될 수 있다.

### Download helper cleanup

- [ ] blob 다운로드 유틸을 공용 함수로 정리한다.
- [ ] PDF 원본, HTML 리포트, Word 리포트, Refine docx 다운로드가 같은 helper를 쓰도록 맞춘다.
- [ ] 관련 파일:
  - `lib/pdf-workspace/format.ts`
  - `components/pdf-workspace.tsx`
  - `components/refine-workspace.tsx`

## Verification Checklist

리팩토링 후 최소 확인:

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `/` 런처 첫 화면 확인
- [ ] `/pdf` PDF 업로드, 영역 선택, AI 분석, Word 리포트 다운로드 확인
- [ ] `/pdf` 문서 전체 요약 확인
- [ ] `/refine` 이미지 업로드, 분석, docx 다운로드 확인
- [ ] Gemini `RECITATION` 오류 메시지/재시도 흐름 확인
