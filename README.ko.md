# herdr-note

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

Herdr app 오른쪽에 현재 Space와 탭의 메모를 함께 표시하는 `note` 모드입니다.
우측 상단 **Files 버튼 바로 왼쪽의 Note 버튼**으로 패널을 열고 닫습니다.

- 위쪽 **Space**: 프로젝트 공통 메모 하나를 장기 보관합니다.
- 아래쪽 **Tab**: 선택한 탭의 작업 메모 하나를 표시합니다. 탭 자체를 닫으면 삭제됩니다.
- 일반 텍스트, 자동 저장, 영역별 접기·펼치기, 위아래 높이와 전체 너비 조절을 지원합니다.
- 패널 열림 상태는 현재 레이아웃 전체에 공통입니다. 메모 내용은 현재 Space와 탭을 따라갑니다.
- 같은 탭의 Agent들은 탭 메모를 공유합니다. Agent를 바꾸거나 패널을 숨겨도 메모는 삭제되지 않습니다.

Space·Tab 제목 옆의 `−`·`+`로 각 영역의 메모 글자 크기를 따로 조절합니다.
기본 13px에서 1px씩, 10~28px 범위로 바뀌며 제목과 버튼 크기는 유지됩니다.
크기는 영역별 설정이므로 Space나 탭을 바꾸어도 유지되고, 앱 재실행 후에도 복원됩니다.

Herdr **데스크톱 앱**용 모드입니다. 기본 `main` 레이아웃과 그 구조를 유지한 복사본을
대상으로 하며, 모든 사용자 레이아웃이나 모든 OS에서의 동작을 보장하지는 않습니다.
설치 연결은 Herdr 0.1.14·0.1.15의 기본 구조를 대상으로 합니다.
검증 범위는 [VALIDATION.md](VALIDATION.md)를 참고하세요.

## 설치

설치할 때는 **Node 22 이상**, 실행 중인 Herdr app, PATH에서 실행 가능한 `herdr-app` CLI가
필요합니다. 설치 후 모드를 실행하는 데는 Node나 npm이 필요하지 않습니다. 추가 패키지를
다운로드하거나 `npm install`을 실행할 필요도 없습니다.

```sh
git clone https://github.com/brad36i/herdr-note.git
cd herdr-note
node scripts/install.mjs --dry-run
node scripts/install.mjs
```

`--dry-run`은 변경 계획만 보여줍니다. 실제 설치는 현재 레이아웃과 탭 바를 각각
`herdr-note`, `note-tabs`로 복사하고 복사본의 Files 버튼 바로 왼쪽에 Note 버튼을 추가합니다.
오른쪽 메모 패널을 연결한 새 레이아웃으로 전환합니다. 기존 레이아웃·탭 바·키 설정과
메모 데이터는 덮어쓰지 않습니다.

설치된 `mods/note/mod.json`은 `place: none`을 사용하여 원래 레이아웃에 패널이 자동으로
추가되는 것을 막습니다. 동일한 note 런타임이 이미 있으면 재사용할 수 있지만, 다른 파일이나
대상 레이아웃·탭 바 이름이 충돌하면 덮어쓰지 않고 중단합니다. 기본 구조를 찾을 수 없는
사용자 레이아웃도 자동 변경하지 않습니다.

레이아웃·모드 이름은 영문·숫자·`-`·`_`만 지원합니다. 복제된 탭 바와 레이아웃은 원본의
향후 업데이트를 자동으로 받지 않습니다. 다른 컴퓨터에는 같은 설치 절차를 각각 실행하며,
메모 자체는 컴퓨터 사이에 동기화되지 않습니다.

필요하면 다음 옵션으로 경로와 새 복사본 이름을 지정합니다. 경로에 공백이 있으면 따옴표로 감싸세요.

```sh
node scripts/install.mjs --home "/path/to/herdr-app" --app "/path/to/herdr-app"
node scripts/install.mjs --layout-name my-note-layout --toolbar-name my-note-tabs
```

`--home`은 Herdr 앱 홈 디렉터리, `--app`은 CLI 실행 파일 경로입니다. Windows에서는
`--app "C:\path\to\herdr-app.exe"`처럼 지정할 수 있습니다. 앱 홈은 모든 OS에서 아래
우선순위로 결정합니다.

1. `--home`
2. `HERDR_APP_HOME`
3. `XDG_CONFIG_HOME/herdr-app`
4. 사용자 홈의 `.config/herdr-app`

설치 중 실패하면 원래 표시하던 레이아웃으로 돌아가도록 시도합니다. 새로 만든 복사본은
문제를 확인할 수 있도록 남겨 둡니다. 출력된 경로를 확인한 뒤 정리하면 됩니다.

## 저장과 삭제

메모는 앱 홈의 `shared.json`에 있는 `note.state` 키에 **평문**으로 저장됩니다. 모드는
Herdr의 저장 API를 사용하며 파일을 직접 읽거나 쓰지 않습니다. 이름 대신 머신·Space·탭의
ID로 연결하므로 이름이나 순서를 바꾸어도 유지됩니다. 새로 만든 동명 탭은 다른 메모입니다.

입력이 바뀔 때마다 저장 상태를 갱신하고 디스크 기록은 Herdr에 맡깁니다. 앱을 정상 종료하고
같은 탭을 다시 열면 메모가 복원됩니다. 운영체제 로그아웃·컴퓨터 종료 자체로 삭제하지는
않지만, 재시작 후 같은 탭 ID가 복원되어야 그 탭 메모를 계속 사용할 수 있습니다.
강제 종료·전원 차단 직전의 마지막 변경까지 보장하지는 않습니다.

탭 메모는 해당 머신의 레이아웃이 `ready`이고 탭이 실제로 사라졌을 때만 정리합니다.
로딩·오프라인만으로는 삭제하지 않습니다. 마지막 터미널의 종료로 탭 자체가 사라지는
경우도 삭제에 포함되며, **탭 메모에는 휴지통이 없습니다.** 모드가 꺼져 있던 동안 탭이
사라졌다면 다음 로드에서 목록을 확인한 뒤 정리합니다.

Space 메모는 Space를 닫아도 자동 삭제하지 않습니다. 닫힌 Space 메모의 별도 검색·복원
화면은 없습니다. 여러 복사본은 같은 메모를 공유하며 같은 메모의 동시 편집은 마지막 입력이
우선합니다. 여러 컴퓨터 사이의 동기화 기능은 없습니다.

## 되돌리기와 제거

Herdr의 레이아웃 전환 메뉴로 설치 전 레이아웃을 선택하면 됩니다. 예를 들어 원래
`main`을 사용했다면 다음 명령으로 돌아갈 수 있습니다.

```sh
herdr-app do layout.switch '{"name":"main"}'
```

다른 앱 홈을 사용한다면 설치 때와 같은 `HERDR_APP_HOME`을 지정하세요. PowerShell 등에서
JSON 인자 전달이 다르면 앱의 레이아웃 메뉴를 사용해도 됩니다. 설치기가 출력한 새 레이아웃과
탭 바 복사본, `mods/note`를 더 이상 참조하지 않는 것을 확인한 뒤 제거할 수 있습니다.
**제거하려고 `shared.json` 전체를 삭제하지 마세요.** 다른 모드의 데이터도 들어 있습니다.

## 보안과 검증

note 런타임은 네트워크 전송·셸 실행·클립보드 읽기·Agent 전송을 하지 않습니다.
Herdr 모드는 trusted code이며 다른 모드나 같은 계정의 프로그램으로부터 메모를 보호하는
저장소는 아닙니다. 비밀번호·API 키 보관용으로 사용하지 마세요.

설치기는 로컬 파일을 읽고 새 복사본을 만들며 Herdr CLI를 실행합니다. 런타임과 설치기가
어디까지 변경하는지는 [SECURITY.md](SECURITY.md)에 설명했습니다. 검증 결과와 미검증 항목은
[VALIDATION.md](VALIDATION.md)에서 확인할 수 있습니다.

Linux·macOS·Windows에서 각각 자동 테스트 38개가 통과했습니다. 타입·ESLint 검사와
Linux의 Herdr native 검사도 통과했습니다. macOS·Windows의 실제 Herdr 화면과 입력기는
아직 검증하지 않았습니다.

```sh
npm test
npm run check
```

`npm run check`에는 `herdr-app`이 필요합니다. 이미 설치된 TypeScript CLI를 사용하려면
`NOTE_TSC` 환경 변수에 `typescript/bin/tsc` 경로를 지정합니다. 테스트는 Node의 실험적
VM module API를 사용하므로 경고가 표시될 수 있습니다.

개발 계획은 [PLAN.md](PLAN.md), 재구성 설명은 [RECIPE.md](RECIPE.md)를 참고하세요.
