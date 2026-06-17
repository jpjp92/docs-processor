# PDF Text Object Editing Notes

## Goal

PDF 위에 새 텍스트를 덮는 오버레이 방식이 아니라, PDF 내부 content stream의 텍스트 drawing 명령을 직접 찾아 수정하는 방안을 검토한다.

## 왜 어려운가

PDF의 텍스트는 일반 문서 편집기처럼 `문단 -> 글자` 구조로 저장되지 않는다.

- 텍스트는 페이지 content stream 안의 drawing 명령으로 들어간다.
- 같은 문장도 여러 `Tj`, `TJ` 조각으로 쪼개질 수 있다.
- 실제 문자열이 압축 stream, hex string, custom encoding, subset font, ToUnicode CMap 안에 있을 수 있다.
- 한글 PDF는 보통 CID font와 glyph id 기반으로 저장되어, 화면에 보이는 글자와 PDF 내부 바이트가 1:1로 대응하지 않을 수 있다.
- 글자 길이가 바뀌면 좌표, 줄바꿈, kerning, stream length, xref 업데이트가 필요하다.

따라서 “PDF 내부 텍스트 수정”은 문서마다 성공률 차이가 크고, 일반 워드프로세서식 편집 기능으로 만들기 어렵다.

## 방안 1. 같은 길이 바이트 치환

content stream 안에서 `(Hello)` 같은 literal string 또는 `<48656c6c6f>` 같은 hex string을 찾아 같은 byte 길이의 문자열로 바꾼다.

장점:

- 구현이 단순하다.
- 기존 xref나 stream length를 유지할 수 있다.
- 특정 템플릿 PDF에는 꽤 안정적으로 적용 가능하다.

단점:

- 같은 길이 또는 더 짧은 문자열만 현실적이다.
- 압축된 stream은 먼저 해제해야 한다.
- 한글/특수 폰트/인코딩 PDF에는 거의 바로 적용하기 어렵다.
- 텍스트가 여러 조각으로 나뉘면 찾기 어렵다.

적합한 경우:

- 시스템이 직접 생성한 단순 PDF
- 영문/숫자 중심
- 폼 번호, 날짜, 짧은 라벨 교체

## 방안 2. 압축 해제 후 content stream 재작성

qpdf, mutool, pdfcpu 같은 도구로 PDF stream을 해제하고 content stream을 분석/수정한 뒤 다시 PDF로 저장한다.

장점:

- 실제 PDF 내부 stream을 다룰 수 있다.
- 압축 PDF까지 실험 가능하다.
- 변경 후 다시 최적화할 수 있다.

단점:

- 외부 CLI 의존성이 필요하다.
- 텍스트 연산자 파싱과 escaping 처리가 필요하다.
- xref, object stream, incremental update 처리까지 고려해야 한다.

권장 실험 도구:

- `qpdf --qdf --object-streams=disable input.pdf unpacked.pdf`
- `mutool clean -d input.pdf unpacked.pdf`
- `pdfcpu optimize`

## 방안 3. PDF 파서/작성 라이브러리 사용

Node 기준으로는 `pdf-lib`, Python 기준으로는 `pikepdf`/`PyMuPDF` 등을 검토할 수 있다.

주의:

- 많은 라이브러리는 “기존 텍스트 객체 수정”보다 “새 텍스트 그리기”에 강하다.
- `pdf-lib`도 기존 페이지에 텍스트를 추가하는 것은 쉽지만, 기존 content stream의 특정 텍스트를 의미적으로 찾아 바꾸는 기능은 직접 구현해야 한다.
- `pikepdf`는 qpdf 기반이라 객체/stream 조작에는 좋지만, 텍스트 레이아웃 의미 분석은 별도 구현이 필요하다.

## 방안 4. OCR/재생성 방식

페이지를 이미지 또는 구조화 데이터로 읽고, 수정된 PDF를 새로 생성한다.

장점:

- 보이는 결과를 통제하기 쉽다.
- 한글/스캔 문서에도 접근 가능하다.

단점:

- 원본 PDF 내부 객체를 수정하는 것은 아니다.
- 원본의 검색 가능 텍스트, 폰트, 링크, 태그 구조가 손상될 수 있다.

## 현실적인 제품 방향

이 프로젝트에서는 다음 순서가 적절하다.

1. 분석 도구 유지
2. 오버레이 기반 텍스트/하이라이트/메모 추가
3. 사용자가 만든 오버레이를 새 PDF로 내보내기
4. 별도 실험 모드에서 같은 길이 텍스트 객체 치환 지원
5. 특정 템플릿 PDF에 한해 content stream 직접 수정 지원

범용 PDF 텍스트 편집기를 목표로 하면 구현 난이도와 유지보수 비용이 크게 올라간다.

## 실험 스크립트

`scripts/pdf-text-object-lab.mjs`는 의존성 없이 동작하는 작은 실험용 스크립트다.

기능:

- 단순한 비압축 PDF 생성
- content stream 안의 literal string 치환
- 치환 결과를 새 PDF로 저장
- 치환 후 stream length/xref를 건드리지 않기 위해 같은 byte 길이만 허용

사용 예:

```bash
npm run pdf:edit-lab
```

결과:

- `tmp/pdf-text-object-lab/original.pdf`
- `tmp/pdf-text-object-lab/edited.pdf`

주의:

- 이 스크립트는 범용 PDF 편집기가 아니다.
- 실제 PDF에 적용하려면 압축 해제, 텍스트 연산자 파싱, 인코딩 처리, 길이 변경 시 재작성 로직이 필요하다.

## 실제 PDF 테스트

### GLM 논문 PDF

테스트 파일:

- `tmp/pdf-text-object-lab/glm5.1_paper.pdf`

검사:

```bash
npm run pdf:inspect -- tmp/pdf-text-object-lab/glm5.1_paper.pdf GLM Abstract "Vibe Coding"
```

결과:

- 전체 stream: `801`
- 디코딩 가능 stream: `791`
- 텍스트 연산자 포함 stream: `65`
- 1페이지 제목 텍스트는 `20 0 obj`의 `/FlateDecode` content stream 안에 `TJ` 연산자로 존재
- 제목은 다음처럼 단어가 조각난 상태로 저장됨

```text
[(GLM-5:)-310(fr)18(om)-250(V)37(ibe)-250(Coding)-250(to)-250(Agentic)-250(Engineering)]TJ
```

증분 수정:

```bash
npm run pdf:replace-lab -- \
  tmp/pdf-text-object-lab/glm5.1_paper.pdf \
  tmp/pdf-text-object-lab/glm5.1_paper-edited-title.pdf \
  20 \
  "GLM-5:" \
  "GLM-X:"
```

결과:

- 원본 PDF를 직접 덮어쓰지 않음
- 파일 끝에 새 `20 0 obj`와 새 xref/trailer를 append
- `GLM-5:`를 `GLM-X:`로 바꾼 content stream을 새 객체로 추가
- 압축 stream 길이는 `1754`에서 `1755`로 변경되었지만, incremental update라 전체 PDF 재작성 없이 처리 가능

주의:

- 단순 stream 검사 도구는 원본 `20 0 obj`와 append된 새 `20 0 obj`를 모두 보기 때문에 `GLM-5:`와 `GLM-X:`가 같이 검색될 수 있다.
- 정상 PDF 뷰어는 마지막 xref가 가리키는 새 객체를 사용해야 한다.
- 이 방식은 전통적인 xref table PDF에는 실험 가능하지만, xref stream/object stream PDF는 별도 처리가 필요하다.

### 한글/HWP 보고서 PDF

테스트 파일:

- `tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서.pdf`

검사:

```bash
npm run pdf:inspect -- \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서.pdf" \
  AI 2025
```

결과:

- 전체 stream: `929`
- 디코딩 가능 stream: `927`
- 텍스트 연산자 포함 stream: `169`
- PDF 생성 도구는 `Hwp 2020`, producer는 `Hancom PDF`
- 한글 본문은 사람이 읽는 문자열이 아니라 `<0005>`, `<6fa6>` 같은 glyph/CID 코드 중심으로 저장됨
- 첫 페이지 content stream은 `33 0 obj`

샘플:

```text
[<0005>105.300003<0006>105.300003<0007>105.300003<0008>105.300003<0004>105.300003<0003>]TJ
```

증분 수정:

```bash
npm run pdf:replace-lab -- \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서.pdf" \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서-edited-stream33.pdf" \
  33 \
  "<0005>" \
  "<0006>"
```

결과:

- 새 `33 0 obj`와 xref/trailer가 파일 끝에 append됨
- 압축 stream 길이는 `1991`에서 `1993`으로 변경
- PDF 내부 객체 변경 자체는 가능
- 다만 이 변경은 “사용자가 보는 한글 단어를 찾아 바꾼 것”이 아니라 glyph code 단위 변경

중요한 한계:

- HWP/Hancom 계열 PDF는 한글이 glyph/CID 코드로 저장되어 문자열 검색/치환이 바로 되지 않는다.
- 실제 단어 수정 기능을 만들려면 ToUnicode CMap, font encoding, glyph id 매핑을 해석해야 한다.
- 같은 glyph code가 문서 곳곳에서 반복될 수 있어, 단순 `<0005>` 치환은 의도하지 않은 글자도 바꿀 위험이 있다.

스크립트 보정:

- 초기 stream 탐색 정규식이 page object에서 다음 stream object까지 과하게 매칭할 수 있어 수정했다.
- 현재는 `obj ... endobj` 경계를 먼저 잡고, 그 안에 직접 포함된 `stream/endstream`만 stream object로 취급한다.

#### 폰트 매핑 해석

첫 페이지 구조:

- Page: `10 0 obj`
- Resources: `9 0 obj`
- Contents: `33 0 obj`
- 표지 제목 폰트: `/F2 15 0 R`
- `/F2` ToUnicode CMap: `1490 0 obj`

확인 명령:

```bash
npm run pdf:font-map -- \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서.pdf" \
  10
```

`/F2` 매핑 일부:

```text
<0003> -> 공백
<0004> -> 라
<0005> -> 산
<0006> -> 업
<0007> -> 인
<0008> -> 프
<0009> -> 성
<000a> -> 조
<000b> -> 및
<000c> -> 공
<000d> -> 능
<000e> -> 지
<000f> -> 용
<0010> -> 활
```

따라서 표지 제목의 첫 단어는 다음처럼 해석된다.

```text
<0005><0006><0007><0008><0004><0003>
= 산 업 인 프 라 공백
= 산업인프라 
```

처음에 수행한 `<0005> -> <0006>` 수정은 실제로 `산 -> 업` 변경이었다.

겹쳐 보인 이유:

- 표지 제목은 같은 글자를 좌표를 조금씩 바꿔 여러 번 그려 그림자/굵기 효과를 만든다.
- `산업인프라` 조각은 `33 0 obj` 안에서 `19`회 반복된다.
- 첫 번째 occurrence만 바꾸면 `업업인프라` 레이어 1개와 `산업인프라` 레이어 18개가 겹쳐 보인다.

전체 레이어 수정:

```bash
npm run pdf:replace-lab -- \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서.pdf" \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서-edited-title-all-layers.pdf" \
  33 \
  "[<0005>105.300003<0006>105.300003<0007>105.300003<0008>105.300003<0004>105.300003<0003>]TJ" \
  "[<0006>105.300003<0006>105.300003<0007>105.300003<0008>105.300003<0004>105.300003<0003>]TJ" \
  --all
```

결과:

- matching occurrences: `19`
- 같은 제목 레이어를 모두 변경
- 단일 레이어만 바뀌어 겹치는 문제를 줄일 수 있음

다음 단계:

- `ToUnicode`를 이용해 content stream의 `TJ` 배열을 사람이 읽는 문자열로 복원
- 사용자가 수정할 문자열을 찾으면, 해당 문자열을 구성하는 CID/glyph 코드 배열과 occurrence 범위를 역추적
- 같은 시각 레이어로 반복된 occurrence 묶음을 함께 수정
- 새 문자열이 기존 폰트의 ToUnicode/CID 매핑에 없으면 같은 폰트로는 직접 치환 불가
- 없는 글자는 오버레이 텍스트 또는 새 폰트 삽입 방식이 필요

#### 기존 폰트에 없는 글자 수정

요청:

```text
산업인프라 조성 및 인공지능 활용 -> 테스트중입니다
```

확인 결과:

- `/F2` 폰트의 ToUnicode에는 `테`, `스`, `트`, `중`, `입`, `니`, `다`가 없음
- 문서 전체 ToUnicode 기준으로도 `테`가 없음
- 따라서 기존 glyph code 치환만으로 `테스트중입니다`를 만들 수 없음

우회 실험:

```bash
npm run pdf:title-overlay-lab -- \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서.pdf" \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서-title-overlay-test.pdf" \
  "테스트중입니다"
```

처리 방식:

- `9 0 obj` resource dictionary에 `/KOR` 폰트 리소스 추가
- `10 0 obj` page contents를 `[ 33 0 R 2186 0 R ]`로 갱신
- `2186 0 obj`에 흰색 사각형으로 기존 첫 줄 제목 영역을 덮는 content stream 추가
- `/HYGoThic-Medium` + `/UniKS-UCS2-H` CID font를 사용해 `테스트중입니다`를 UTF-16BE hex로 그림

추가된 overlay stream:

```text
q
1 1 1 rg
72 590 470 68 re f
0 0 0 rg
BT
/KOR 38 Tf
1 0 0 1 185 620 Tm
<d14cc2a4d2b8c911c785b2c8b2e4> Tj
ET
Q
```

주의:

- 이 방식은 기존 텍스트 객체 치환이 아니라 “덮고 새로 그리기”에 가깝다.
- `/HYGoThic-Medium`은 표준 CJK CID font 이름에 의존하므로 뷰어/환경에 따라 대체 폰트 렌더링 차이가 있을 수 있다.
- 안정적인 제품 기능으로 만들려면 실제 한글 폰트 파일을 embedded subset으로 넣는 방식이 필요하다.

#### Embedded subset 폰트 방식

목표:

- 뷰어의 대체 CJK 폰트에 기대지 않고, 실제 한글 폰트를 PDF에 포함한다.
- 전체 폰트 파일을 넣지 않고 필요한 glyph만 subset embed한다.

준비:

```bash
npm install pdf-lib @pdf-lib/fontkit
mkdir -p tmp/fonts
curl -L -o tmp/fonts/NotoSansKR-Regular.ttf \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf"
```

실험:

```bash
npm run pdf:embedded-title-lab -- \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서.pdf" \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서-title-embedded-font.pdf" \
  "tmp/fonts/NotoSansKR-Regular.ttf" \
  "테스트중입니다"
```

결과:

- output: `tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서-title-embedded-font.pdf`
- PDF 페이지 수: `125`
- 원본 PDF 크기: 약 `2.3MB`
- Noto Sans KR 원본 TTF 크기: 약 `10MB`
- embedded output 크기: 약 `2.3MB`
- 새 subset font:
  - `/NotoSansKR-Thin-2000`
  - `/FontFile2 2188 0 R`
  - font stream `/Length 951`
- 새 text content stream:
  - `/NotoSansKR-Thin-9742682568 42 Tf`
  - `<00010002000300040005...>` 형태의 subset glyph code 사용

의미:

- 10MB 폰트 전체를 넣지 않고 필요한 글리프만 들어갔다.
- 기존 PDF를 incremental append로 유지하는 방식은 아니고, `pdf-lib`가 PDF를 새로 저장한다.
- 기존 제목을 직접 삭제하는 대신 흰색 사각형으로 덮고 새 텍스트를 그린다.

제품화 시 고려:

- 좌표/폭/줄바꿈 계산 UI 필요
- 기존 텍스트 영역을 정확히 덮는 배경 처리 필요
- 한글 폰트 라이선스와 배포 정책 확인 필요
- 검색 가능한 텍스트 품질을 위해 ToUnicode CMap 생성 여부 확인 필요
- incremental update를 유지하려면 subset font 객체, CIDFont, ToUnicode, FontDescriptor, FontFile2를 직접 append하는 구현이 필요

#### 선택 영역 기반 치환 랩

목표:

- 사용자가 PDF 화면에서 특정 텍스트 영역을 선택했다고 가정한다.
- 해당 페이지의 content stream을 해석해 선택 가능한 텍스트 run 후보를 만든다.
- 기존 폰트, 크기, 색상, 그림자/굵기 레이어를 유지하면서 같은 글리프 수의 텍스트로 치환한다.

HTML 랩 생성:

```bash
npm run pdf:selection-replace-lab -- inspect \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서.pdf" \
  10 \
  "tmp/pdf-text-object-lab/selection-replace-lab.html"
```

결과:

- `tmp/pdf-text-object-lab/selection-replace-lab.html`
- text run: `209`
- grouped candidate: `11`

HTML 랩에서 확인 가능한 항목:

- 사람이 읽는 텍스트
- PDF 내부 폰트 이름
- 글리프 수
- 반복 레이어 수
- x/y 좌표 범위
- 입력한 새 텍스트가 기존 폰트로 치환 가능한지 여부
- 실행 가능한 CLI 명령
- 브라우저에서 바로 수정 PDF 다운로드

예시 후보:

```text
산업인프라  /F2  6 glyphs  19 layers
조성        /F2  3 glyphs  19 layers
및          /F2  2 glyphs  19 layers
인공지능    /F2  5 glyphs  19 layers
활용        /F2  3 glyphs  19 layers
```

선택 영역 치환:

```bash
npm run pdf:selection-replace-lab -- replace \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서.pdf" \
  "tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서-selection-replaced.pdf" \
  10 \
  "산업인프라 " \
  "업업인프라 " \
  --all-layers
```

결과:

- output: `tmp/pdf-text-object-lab/산업인프라 및 AI활용방안 조사 최종보고서-selection-replaced.pdf`
- matched runs: `19`
- updated run pattern: `1`
- `산업인프라 `를 같은 글리프 수의 `업업인프라 `로 치환
- 표지 제목의 19개 반복 레이어를 함께 바꿔 겹침을 줄임

현재 제한:

- 치환 텍스트는 기존 run과 글리프 수가 같아야 한다.
- 새 텍스트의 모든 글자가 같은 PDF 폰트의 ToUnicode 역매핑에 있어야 한다.
- HTML 저장 기능은 브라우저의 `CompressionStream("deflate")`를 사용한다.
- Chrome/Edge 계열에서는 바로 다운로드 테스트가 가능하고, 미지원 브라우저에서는 CLI 명령을 사용한다.
- 실제 서비스에서는 화면 선택 영역의 좌표와 PDF text run 좌표를 매칭하는 단계가 추가로 필요하다.
