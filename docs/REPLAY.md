# Replay JSON v1

```json
{
  "format": "riichi-mahjong",
  "version": 1,
  "seed": 12345,
  "config": { "length": "hanchan", "aka": true, "doubleYakuman": true, "kiriage": false, "startingPoints": 25000, "seats": [] },
  "actions": [],
  "events": []
}
```

위 예제는 필드 설명용이며 실제 파일의 `seats`에는 4개 좌석, `events`에는 배패와 친 첫 쯔모가 반드시 들어간다. 정상 예제는 앱의 패보 내보내기로 생성한다.

## 패와 상태

물리 ID는 0~135 정수, 종류는 `Math.floor(id / 4)`로 0~33이다. 만0~8, 통9~17, 삭18~26, 동27·남28·서29·북30·백31·발32·중33. 적도라 옵션이 켜져 있으면 물리 ID16·52·88이 적5이다.

후로는 `{kind, tiles, called, from}`으로 기록한다. kind는 `chi`, `pon`, `minkan`, `ankan`, `kakan`. 안깡의 called는 null이다. 가깡은 원래 퐁의 방향과 호출 패를 보존하고 added에 네 번째 패를 기록한다.

버림패에는 물리 ID, 쯔모기리 여부, 리치 선언 여부, 울림 여부, 사건 번호가 있다. 울린 패는 카와에서 삭제하지 않고 표시만 옅게 한다. 공개 매수 집계는 물리 ID Set으로 중복을 제거한다.

## 명령

- `{kind:"discard", player, tile, riichi}`
- `{kind:"respond", player, choice}`: choice=-1은 패스. 나머지는 해당 시점 결정적으로 열거한 반응 목록 인덱스.
- `{kind:"tsumo", player}`
- `{kind:"kan", player, kanKind, t}`
- `{kind:"kyuushu", player}`
- `{kind:"next"}`

사람과 AI의 결정 모두 명시적 명령으로 저장하므로 재생 시 AI를 다시 실행하지 않는다.

## 사건

`deal`(전체 패산과 4인 배패 포함), `draw`, `discard`, `response`, `riichi`, `call`, `kan-offer`, `kan`, `win`, `abort`, `draw-end`, `match-end` 순서 기록. 모든 사건에 연속 seq가 있다. 화료는 역·부수·타점과 점수 변동까지 포함한다.

처음부터 같은 시드와 명령으로 합법성 검사를 거쳐 재생한 사건이 원본과 다르면 불러오기를 거부한다. 크기 제한 25MB, 명령 제한 12,000개. HTML은 실행하지 않고 이름·문자열을 escape한다.

렌더링용 전체 상태 스냅샷은 메모리에만 있으며 파일에 중복 저장하지 않는다. 복기는 이벤트별 스냅샷으로 이동한다. 타패 대안은 타패 직전 스냅샷의 자기 손패와 당시 공개 정보로 계산한다.

## 버전 정책

이 파일은 다른 서비스의 패보 표준이 아닌 프로젝트 고유 포맷이다. 셔플, 룰, 명령 인덱스, 사건 내용이 바뀌는 호환성 파괴 수정에는 버전을 올리고 v1 재생 경로를 유지하거나 명시적으로 거부해야 한다. 손패·패산을 모두 포함하므로 진행 중 공유하면 숨은 정보가 노출된다.
