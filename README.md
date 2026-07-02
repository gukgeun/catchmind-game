# 캐치마인드 (Catchmind Clone)

Next.js + Firebase Realtime Database로 만든 실시간 그림 맞히기 게임입니다.

## 기능

- 방 코드로 입장 (최대 16명)
- 출제자 자동 순환 (턴제)
- 제시어는 출제자에게만 공개 (Firebase 보안 규칙으로 서버 단에서 강제)
- 그림 실시간 동기화 (색상 / 굵기 / 지우개 / 전체 지우기)
- 채팅으로 정답 제출, 오답도 모두에게 공개, 정답 일치 시 자동 처리
- 3분 타이머, 시간 종료 시 정답 공개 후 다음 턴 진행
- 점수판 (참가자 목록에 표시)

## 시작하기 (로컬 개발)

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인할 수 있습니다.

## Firebase 프로젝트 설정 (필수)

이 프로젝트는 `lib/firebase.js`에 이미 설정된 Firebase 프로젝트(`catchmind-game`)를 사용합니다.
게임이 정상적으로 동작하려면 Firebase 콘솔에서 아래 두 가지를 반드시 설정해야 합니다.

### 1. 익명 로그인(Anonymous Authentication) 활성화

참가자를 구분하기 위해 Firebase Anonymous Auth를 사용합니다.

1. [Firebase 콘솔](https://console.firebase.google.com/) → 프로젝트 선택 → **Authentication**
2. **Sign-in method** 탭 → **Anonymous** 항목을 **사용 설정**으로 변경

### 2. Realtime Database 보안 규칙 배포

제시어(`word`)는 출제자 본인만 읽고 쓸 수 있도록 별도 경로(`secretWords/{roomCode}`)에 저장하고,
보안 규칙으로 현재 턴의 `drawerUid`와 요청자의 `auth.uid`가 일치할 때만 접근을 허용합니다.
저장소 루트의 `database.rules.json` 내용을 그대로 Firebase 콘솔에 붙여넣어 배포하세요.

1. Firebase 콘솔 → **Realtime Database** → **규칙(Rules)** 탭
2. 이 저장소의 `database.rules.json` 내용을 복사해서 붙여넣고 **게시(Publish)**

> Realtime Database가 아직 생성되지 않았다면 먼저 **Realtime Database 만들기**를 진행한 뒤,
> `databaseURL`이 `lib/firebase.js`에 있는 값과 일치하는지 확인하세요.

## Vercel 배포

1. GitHub 등에 리포지토리를 푸시합니다.
2. [Vercel](https://vercel.com/new)에서 저장소를 Import 합니다.
3. Framework Preset은 Next.js가 자동으로 인식됩니다. 별도의 환경 변수 설정은 필요하지 않습니다
   (Firebase config가 `lib/firebase.js`에 직접 포함되어 있습니다).
4. Deploy를 클릭하면 배포가 완료됩니다.

## 데이터 구조 (Realtime Database)

```
rooms/{roomCode}/meta        # 방 정보 (호스트, 상태, 인원수 등) - 인증된 사용자 모두 read/write
rooms/{roomCode}/players/{uid}
rooms/{roomCode}/turn        # 공개 턴 정보 (출제자, 글자 수, 난이도, 타이머 등 - 단어 텍스트 자체는 없음)
rooms/{roomCode}/strokes/{turnIndex}/{strokeId}  # 그림 스트로크
rooms/{roomCode}/chat/{turnIndex}/{messageId}    # 채팅 / 정답 시도

secretWords/{roomCode}/word  # 실제 제시어 - 현재 턴의 drawerUid만 read/write 가능 (보안 규칙으로 강제)
```

## 게임 진행 방식 (서버리스 아키텍처 참고)

Cloud Functions 없이 클라이언트 권한 분산 방식으로 턴을 진행합니다.

- 출제자 본인의 브라우저가 제한 시간 타이머와 정답 판정을 담당합니다.
- 턴이 끝나면 다음 출제자로 지정된 클라이언트가 자신의 제시어를 직접 뽑아 저장합니다.
- 다음 출제자가 응답하지 않을 경우(연결 끊김 등) 방장의 클라이언트가 일정 시간 후 다음 사람으로 강제 진행합니다.

## 단어 풀

`lib/wordList.js`에 초등 고학년(10~13세) 수준 단어 1000개가 난이도별로 정리되어 있습니다.

- 쉬움(easy) 340개
- 보통(normal) 330개
- 어려움(hard) 330개
