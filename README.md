# CHROMASCII — 실시간 컬러 비디오 → 아스키 아트 스튜디오

[![Live Demo (GitHub Pages)](https://img.shields.io/badge/Live_Demo-GitHub_Pages-38bdf8?style=for-the-badge&logo=github)](https://skwzz.github.io/chromascii/)
![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-a855f7?style=for-the-badge)

외부 라이브러리 의존성 **0개**로 브라우저에서 100% 실시간(60FPS)으로 영상(`MP4 / WebM / MOV`), 이미지, 웹캠을 **트루컬러 RGB 아스키 아트**로 변환하고, 원본 오디오 포함 `.webm` 동영상이나 PNG·컬러 HTML로 바로 저장할 수 있는 정적 웹 스튜디오입니다.

## 주요 기능
- **실시간 입력 (서버 업로드 0바이트)**: 영상/이미지 드래그 앤 드롭, 실시간 웹캠, 내장 60FPS 프로시저럴 데모 3종(`네온 플라즈마`, `3D 회전 토러스`, `사이버 터널`)
- **6종 문자셋**: 클래식, 초정밀 70단계, 블록 픽셀(`░▒▓█`), 도트, 매트릭스, 미니멀
- **6종 컬러 스타일**: 트루컬러 RGB, 고대비 컬러셀(배경 채움), 매트릭스 그린, 레트로 앰버, 사이버펑크, 모노크롬
- **실시간 화질/톤 보정**: 가로 문자 수(48~220), 대비, 밝기, 채도, 명암 반전, CRT 스캔라인, 네온 글로우
- **원본 ↔ 컬러 아스키 분할 비교 슬라이더 (`S`)**
- **브라우저 내 바로 내보내기**:
  - **녹화 시작 / 저장**: 재생 중 스타일을 바꾸며 원하는 구간을 `.webm`으로 녹화 저장
  - **전체 영상 변환**: 업로드한 영상을 `00:00`부터 끝까지 원본 오디오 포함 컬러 아스키 `.webm`으로 자동 변환
  - **PNG 저장**, **아스키 텍스트 클립보드 복사**, **컬러 HTML 저장**
- **한/영 UI 전환 (`한 / EN` 또는 `L` 키)**

## 로컬 실행 방법 (Node.js)
```bash
git clone https://github.com/skwzz/chromascii.git
cd chromascii
node serve.mjs
```
실행 후 브라우저에서 **`http://localhost:3001`** 접속 (포트 변경: `node serve.mjs 8080`)
