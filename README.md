# Riichi Mahjong

HTML5 · CSS3 · ES modules로 작성한 4인 리치마작과 학습 도구입니다. 런타임 의존성, 번들러, 서버 API, 계정 등록이 없습니다.

**[브라우저에서 바로 플레이하기](https://tjdns0511.github.io/Riichi-Mahjong/)** · [MIT License](LICENSE)

## 실행

GitHub Pages 주소로 열면 바로 플레이할 수 있습니다. PC Chrome/Firefox/Edge와 Android Chrome/삼성 인터넷을 대상으로 반응형 화면과 터치 조작을 구현했습니다. 실제 기기·브라우저별 추가 검증은 필요합니다.

로컬에서는 저장소 루트에서 다음 명령을 실행한 뒤 `http://localhost:8080`을 엽니다.

```sh
python3 -m http.server 8080
```

`npm start`도 같은 서버를 실행합니다. 앱 자체에는 `npm install`이나 빌드 과정이 필요 없습니다. ES 모듈과 Web Worker 때문에 `file://`로 HTML을 더블클릭하는 방식은 사용하지 마세요. 최초 접속 후 서비스 워커가 앱 파일을 저장하며, 외부 패 그림이 없어도 유니코드 패로 동작합니다.

## GitHub Pages

`.github/workflows/pages.yml`은 `main` 갱신 시 엔진 테스트와 브라우저 테스트를 통과한 정적 파일을 배포합니다.

1. 저장소 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
2. **Actions → Test and deploy GitHub Pages → Run workflow**를 실행합니다. 이후 `main` 커밋은 자동 배포됩니다.
3. 배포 작업에 표시되는 `github-pages` 주소를 엽니다.

비공개 저장소의 Pages 이용 가능 여부는 GitHub 계정 요금제에 따릅니다. 저장소 공개 범위를 자동 변경하지 않습니다. Pages 활성화는 저장소 관리자가 최초 한 번 설정해야 하며, 기본 Actions 토큰은 Pages를 새로 활성화할 관리 권한을 갖지 않습니다. [GitHub 공식 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 기능

- 4개 좌석별 인간/AI 설정. AI 초급·중급·고급 독립 선택. 핫시트의 차례별 손패 가림.
- 동풍전·반장전, 30,000점 목표 연장, 토비·오라스 친 종료, 점수와 공탁 정산.
- 물리 패 136장, 적5 옵션, 왕패·영상패·도라·우라도라, 모든 치·퐁·깡.
- 리치·더블리치·잇파츠, 세 종류 후리텐, 엄격한 쿠이카에, 부름 우선순위와 더블론.
- 일반형·치또이츠·국사 샨텐, 모든 완성 분해 중 최고 점수 판정, 표준역·역만·복합/더블역만, 상세 부수.
- 패효율 연습과 누적 점수, 실제 선택에 따른 다음 쯔모, Worker 기반 두 번 쯔모 분석.
- 상대 1~2명에 대한 수비 연습과 현물·스지·카베·자패 근거 설명.
- 오라스 순위 조건별 직격·쯔모 역산 및 가정한 판부의 점수 이동 시뮬레이션.
- 패 팔레트·표기 입력을 지원하는 샨텐 계산기, 대기·분해·판부 분석.
- 전 대국 JSON 기록·검증·다운로드·복사·불러오기, 사건 단위 탐색 및 당시 타패 비교.
- 첫 탭 선택/두 번째 탭 타패, 패 추적 강조, 테다시/쯔모기리 구분, 리패·한글 힌트 토글.

## 룰 프로필과 분석의 범위

모든 리치마작 단체에 공통인 단일 ‘공식 룰’은 없으므로, 요청한 옵션을 지원하는 명시적 프로필을 사용합니다. 상세 내용은 [docs/RULES.md](docs/RULES.md)와 앱의 **도움말**을 보세요.

AI는 상대 비공개 손패와 미래 패산을 읽지 않는 휴리스틱입니다. 고급 AI의 추정 텐파이·안전도는 확률 모델이나 최적 전략 보장이 아닙니다. 수비 숫자는 비교 지수입니다. 패효율의 보이지 않는 매수에는 타가 손패·왕패도 포함됩니다. 2회 쯔모 분석은 상대 행동을 제외한 추출 모형입니다.

패보는 본 프로젝트의 `riichi-mahjong` JSON v1이며, 천봉·작혼 패보 호환 형식은 아닙니다. 자세한 재현 방식과 버전 규칙은 [docs/REPLAY.md](docs/REPLAY.md)에 있습니다.

## 구조

| 파일 | 책임 |
| --- | --- |
| `js/core/tiles.js` | 물리 ID, 적패, 표기, 시드 셔플, 도라 순환 |
| `js/core/shanten.js` | 슈트별 메모화 분해, 3종 샨텐, 대기, 우케이레, 2회 분석 |
| `js/core/scoring.js` | 화료 해석, 역·역만·부수, 점수와 수수 |
| `js/core/game.js` | 대국 상태기계, 합법 동작, 반응 창, 점수·국 진행, 패보 |
| `js/core/ai.js` | 공개 정보만 이용하는 공격·수비 평가 |
| `js/core/all-last.js` | 점수표 역산과 동점 우선순위 |
| `js/analysis-worker.js` | 고비용 분석의 UI 스레드 분리 |
| `js/ui/` | 패·탁자·연습·복기 렌더링 |
| `js/app.js` | 이벤트, 탭, 핫시트 프라이버시, 자동 저장 |
| `sw.js` | 앱 셸 오프라인 캐시 |

## 검증

```sh
node --test tests/*.test.js
```

Node.js 22 이상을 사용합니다. 이 테스트에는 판부·역만·대기·후리텐·부름·왕패·점수 보존·손패 기록 검증과 24개 시드의 실제 AI 대국 재생이 포함됩니다.

브라우저 테스트는 개발/CI에서만 Playwright를 사용합니다. 앱에 포함되지 않습니다.

```sh
npm install --no-save playwright@1.62.1
npx playwright install --with-deps chromium
node tests/browser-smoke.mjs
```

1440×1050, 384×854, 854×384, 360×800 뷰포트에서 탭, 핫시트 가림, 두 번 누르기, 분석 Worker, JSON 재생, 가로 넘침을 검사하고 `test-results/`에 화면을 저장합니다. GitHub Actions에서는 결과를 `browser-screenshots` 아티팩트로 받습니다. 실제 Galaxy의 OS 글꼴·브라우저 제스처 확인을 대체하지는 않습니다.

## 타일 리소스

[FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles)의 Regular SVG를 원격 URL에서 읽습니다. 해당 패 그림은 [CC0 1.0](https://github.com/FluffyStuff/riichi-mahjong-tiles/blob/master/LICENSE.md)입니다. 이미지 로딩 중이나 오류 시 유니코드 마작 문자와 CSS 패 테두리를 사용합니다. 외부 JS·CSS 라이브러리는 로드하지 않습니다.

룰 참고: [천봉 매뉴얼](https://tenhou.net/man/). 본 프로젝트의 옵션 차이를 문서에 명시했으며 천봉 자체의 룰셋·패보 포맷을 복제하는 앱은 아닙니다.

## 라이선스

프로젝트 소스 코드와 문서는 [MIT License](LICENSE)로 배포합니다. Copyright (c) 2026 tjdns0511.
원격으로 사용하는 FluffyStuff의 타일 SVG에는 원작자의 CC0 1.0 라이선스가 적용됩니다.
