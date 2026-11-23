/**
 * CHROMASCII — Korean / English Internationalization
 */

export const TRANSLATIONS = {
  ko: {
    pageTitle: 'CHROMASCII — 실시간 컬러 비디오 아스키 아트 스튜디오',
    brandSub: '실시간 컬러 비디오 → 아스키 스튜디오',
    btnUpload: '영상 열기',
    btnWebcam: '웹캠',
    btnWebcamStop: '웹캠 중지',
    btnDemo: '데모 영상',
    btnSplit: '원본 비교',
    btnRecord: '녹화 시작',
    btnRecordStop: '녹화 저장',
    btnFullExport: '전체 영상 변환',
    btnFullCancel: '변환 중지',
    btnPng: 'PNG 저장',
    btnCopyTxt: '텍스트 복사',
    btnHtml: '컬러 HTML',

    dropTitle: '영상 또는 이미지 파일을 여기에 드롭하세요',
    dropSub: 'MP4 · WebM · MOV · PNG · JPG (서버 업로드 없이 브라우저에서 즉시 변환)',

    secSource: '입력 소스',
    sourceDemo: '내장 데모',
    demoPlasma: '네온 플라즈마',
    demoTorus: '3D 회전 토러스',
    demoTunnel: '사이버 터널',

    secCharset: '문자셋 프리셋',
    cs_classic: '클래식',
    cs_dense: '초정밀 70',
    cs_blocks: '블록 픽셀',
    cs_dots: '도트 원형',
    cs_matrix: '매트릭스',
    cs_minimal: '미니멀',

    secColor: '컬러 스타일',
    cm_truecolor: '트루컬러 RGB',
    cm_bgfill: '고대비 컬러셀',
    cm_matrix: '매트릭스 그린',
    cm_amber: '레트로 앰버',
    cm_cyber: '사이버펑크',
    cm_mono: '모노크롬',

    secTuning: '화질 & 톤 보정',
    lblCols: '가로 해상도 (문자 수)',
    lblContrast: '대비',
    lblBrightness: '밝기',
    lblSaturation: '채도',
    lblInvert: '명암 반전',
    lblScanlines: 'CRT 스캔라인',
    lblGlow: '네온 글로우',
    btnResetTune: '보정 초기화',

    secExport: '결과물 내보내기',
    exportHint: '원본 오디오를 포함해 WebM 동영상으로 브라우저에서 직접 인코딩합니다.',
    splitOrig: '원본',
    splitAscii: '컬러 아스키',

    statFps: 'FPS',
    statGrid: '문자 격자',
    statMode: '소스',
    modeDemo: '데모',
    modeVideo: '비디오',
    modeImage: '이미지',
    modeWebcam: '웹캠',

    toastLoadedVideo: (name) => `영상 로드 완료: ${name}`,
    toastLoadedImage: (name) => `이미지 로드 완료: ${name}`,
    toastUnsupported: '지원하는 영상(MP4/WebM/MOV) 또는 이미지 파일을 올려주세요.',
    toastWebcamOn: '실시간 웹캠 아스키 모드 활성화',
    toastWebcamFail: '웹캠 권한이 없거나 카메라를 찾을 수 없습니다.',
    toastDemoOn: '내장 60FPS 프로시저럴 데모 영상으로 전환했습니다',
    toastPngSaved: '컬러 아스키 PNG 이미지를 저장했습니다',
    toastTxtCopied: '현재 프레임 아스키 텍스트를 클립보드에 복사했습니다',
    toastHtmlSaved: '컬러 아스키 HTML 파일을 저장했습니다',
    toastRecStart: '컬러 아스키 동영상 녹화를 시작했습니다',
    toastRecSaved: '컬러 아스키 WebM 동영상 저장 완료!',
    toastFullNeedVideo: '전체 영상 변환은 업로드한 동영상 파일에서 사용할 수 있습니다',
    toastFullStart: '영상 처음부터 끝까지 컬러 아스키로 변환 중...',
    toastRecUnsupported: '이 브라우저에서는 MediaRecorder WebM 녹화가 지원되지 않습니다',
    toastLang: 'UI 언어가 한국어로 변경되었습니다',
  },

  en: {
    pageTitle: 'CHROMASCII — Real-Time Color Video-to-ASCII Studio',
    brandSub: 'REAL-TIME COLOR VIDEO → ASCII STUDIO',
    btnUpload: 'Open Video',
    btnWebcam: 'Webcam',
    btnWebcamStop: 'Stop Cam',
    btnDemo: 'Demo Feed',
    btnSplit: 'Split Compare',
    btnRecord: 'Record Clip',
    btnRecordStop: 'Stop & Save',
    btnFullExport: 'Render Full Video',
    btnFullCancel: 'Cancel Render',
    btnPng: 'Save PNG',
    btnCopyTxt: 'Copy Text',
    btnHtml: 'Color HTML',

    dropTitle: 'Drop a video or image file anywhere',
    dropSub: 'MP4 · WebM · MOV · PNG · JPG (100% local in-browser conversion)',

    secSource: 'INPUT SOURCE',
    sourceDemo: 'Built-in Demo',
    demoPlasma: 'Neon Plasma',
    demoTorus: '3D Torus Knot',
    demoTunnel: 'Cyber Tunnel',

    secCharset: 'CHARACTER RAMP',
    cs_classic: 'Classic',
    cs_dense: 'Ultra 70',
    cs_blocks: 'Blocks',
    cs_dots: 'Dots',
    cs_matrix: 'Matrix',
    cs_minimal: 'Minimal',

    secColor: 'COLOR MODE',
    cm_truecolor: 'True Color RGB',
    cm_bgfill: 'Filled Cells',
    cm_matrix: 'Matrix Green',
    cm_amber: 'Retro Amber',
    cm_cyber: 'Cyberpunk',
    cm_mono: 'Monochrome',

    secTuning: 'IMAGE TUNING',
    lblCols: 'Resolution (Columns)',
    lblContrast: 'Contrast',
    lblBrightness: 'Brightness',
    lblSaturation: 'Saturation',
    lblInvert: 'Invert Luma',
    lblScanlines: 'CRT Scanlines',
    lblGlow: 'Phosphor Glow',
    btnResetTune: 'Reset Tuning',

    secExport: 'EXPORT & RECORD',
    exportHint: 'Encodes Color ASCII + original audio directly in-browser as WebM.',
    splitOrig: 'ORIGINAL',
    splitAscii: 'COLOR ASCII',

    statFps: 'FPS',
    statGrid: 'ASCII GRID',
    statMode: 'SOURCE',
    modeDemo: 'DEMO',
    modeVideo: 'VIDEO',
    modeImage: 'IMAGE',
    modeWebcam: 'WEBCAM',

    toastLoadedVideo: (name) => `Loaded video: ${name}`,
    toastLoadedImage: (name) => `Loaded image: ${name}`,
    toastUnsupported: 'Please upload a supported video (MP4/WebM/MOV) or image file.',
    toastWebcamOn: 'Live webcam ASCII mode enabled',
    toastWebcamFail: 'Could not access webcam permission or device.',
    toastDemoOn: 'Switched to built-in 60FPS procedural demo feed',
    toastPngSaved: 'Saved Color ASCII PNG snapshot',
    toastTxtCopied: 'Copied ASCII text frame to clipboard',
    toastHtmlSaved: 'Downloaded standalone Color ASCII HTML',
    toastRecStart: 'Recording Color ASCII video clip...',
    toastRecSaved: 'Color ASCII WebM video downloaded!',
    toastFullNeedVideo: 'Full video render is available for uploaded video files',
    toastFullStart: 'Rendering full video from start to finish...',
    toastRecUnsupported: 'MediaRecorder WebM export is not supported in this browser',
    toastLang: 'UI language switched to English',
  },
};

export function detectInitialLanguage() {
  try {
    const saved = localStorage.getItem('chromascii_lang');
    if (saved === 'ko' || saved === 'en') return saved;
  } catch {
    // ignore
  }
  return (navigator.language || 'ko').toLowerCase().startsWith('en') ? 'en' : 'ko';
}
