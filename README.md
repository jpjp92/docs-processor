# Docs Processor

PDF 문서를 열고 원하는 영역을 드래그로 선택한 뒤 Claude, OpenAI, Gemini로 분석할 수 있는 Next.js 기반 워크스페이스입니다.

## 주요 기능

- PDF 업로드 및 페이지 렌더링
- 페이지 썸네일 탐색
- 확대/축소 및 스크롤 기반 문서 보기
- PDF 영역 드래그 선택
- 선택 영역 이미지와 추출 텍스트 기반 AI 분석
- 선택 영역별 후속 질문
- 모델 응답 잘림 감지 및 이어서 받기
- 원본 PDF 다운로드
- 분석 결과 JSON 다운로드
- 분석 결과 HTML 리포트 다운로드

## 기술 구성

- Next.js App Router
- React
- TypeScript
- pdf.js CDN 로딩
- lucide-react 아이콘
- Next Route Handler 기반 API 프록시

## 빠른 시작

```bash
npm install
npm run dev
```

기본 개발 주소:

```text
http://localhost:3000
```

다른 포트로 실행하려면:

```bash
PORT=3001 npm run dev
```

## 환경 변수

루트 `.env`에 필요한 키만 설정합니다.

```env
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
GOOGLE_API_KEY=
```

Gemini는 `GEMINI_API_KEY`를 우선 사용하고, 없으면 `GOOGLE_API_KEY`를 사용합니다.

서버에 키가 설정되어 있으면 설정 창에서 해당 프로바이더는 서버 키가 있는 것으로 표시됩니다. 서버 키가 없을 때는 설정 창에서 사용자가 직접 API 키를 입력할 수 있습니다. 이 키는 브라우저 메모리에만 보관되며 새로고침하면 사라집니다.

## 스크립트

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## API

### `GET /api/config`

서버에 설정된 프로바이더 키 여부와 기본 모델명을 반환합니다.

### `POST /api/analyze`

선택 영역 이미지와 텍스트를 표준 메시지 포맷으로 받아 선택한 AI 프로바이더에 전달합니다.

응답에는 다음 정보가 포함됩니다.

```json
{
  "text": "분석 결과",
  "finishReason": "MAX_TOKENS",
  "truncated": true
}
```

`truncated`가 `true`이면 모델 출력 한도 때문에 응답이 중간에 끊겼을 수 있습니다. UI에서는 경고와 함께 이어서 받기 버튼을 표시합니다.

## 분석 결과 내보내기

설정 창에서 분석 결과를 내보낼 수 있습니다.

- `JSON`: 선택 영역 이미지, 추출 텍스트, 질문/답변, 종료 사유 메타데이터 포함
- `HTML 리포트`: 브라우저에서 바로 열어 보기 좋은 단일 HTML 파일

## 개발 메모

Next 개발 서버가 실행 중인 상태에서 `npm run build`를 실행하면 `.next` 산출물이 충돌해 `Cannot find module './xxx.js'` 같은 런타임 오류가 날 수 있습니다.

빌드 확인이 필요하면 개발 서버를 먼저 종료한 뒤 실행하세요.

```bash
rm -rf .next
npm run build
npm run dev
```

## 참고 자료

초기 참고 구현은 [Ref/pdf-workspace](./Ref/pdf-workspace)에 보관되어 있습니다.
