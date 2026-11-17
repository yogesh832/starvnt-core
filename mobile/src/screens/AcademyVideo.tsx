import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';

type Props = {
  url: string;
  captions: string;
  position: number;
  onProgress: (seconds: number, ended: boolean) => void;
  onError: () => void;
};

function BrowserVideo({ url, captions, position, onProgress, onError }: Props) {
  const track = useRef<HTMLTrackElement>(null);
  const lastCheckpoint = useRef(position);
  useEffect(() => {
    if (!captions || !track.current) return;
    const src = URL.createObjectURL(new Blob([captions], { type: 'text/vtt' }));
    track.current.src = src;
    return () => URL.revokeObjectURL(src);
  }, [captions]);
  return <video aria-label="Lesson video" src={url} controls playsInline style={{ width: '100%' }}
    onLoadedMetadata={event => { event.currentTarget.currentTime = Math.min(position, event.currentTarget.duration); }}
    onTimeUpdate={event => {
      const current = event.currentTarget.currentTime;
      if (current >= lastCheckpoint.current + 15) {
        lastCheckpoint.current = current;
        onProgress(current, false);
      }
    }}
    onPause={event => { if (!event.currentTarget.ended) onProgress(event.currentTarget.currentTime, false); }}
    onEnded={event => onProgress(event.currentTarget.currentTime, true)} onError={onError}>
    {captions && <track ref={track} kind="captions" label="Captions" default />}
  </video>;
}

export function AcademyVideo(props: Props) {
  if (Platform.OS === 'web') return <BrowserVideo {...props} />;
  const { url, captions, position, onProgress, onError } = props;
  // Serialize text as script data. Escaping "<" prevents a caption from closing the script.
  const input = JSON.stringify({ url, captions, position }).replace(/</g, '\\u003c');
  const html = `<!doctype html><html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src https: blob:">
    <style>html,body,video{width:100%;height:100%;margin:0;background:#000}</style>
    </head><body><video controls playsinline aria-label="Lesson video"></video>
    <script>
      const { url, captions, position } = ${input};
      const video = document.querySelector('video');
      const send = (event) => window.ReactNativeWebView.postMessage(JSON.stringify({ event, seconds: video.currentTime }));
      let lastCheckpoint = position;
      if (captions) {
        const track = document.createElement('track');
        track.kind = 'captions';
        track.label = 'Captions';
        track.default = true;
        track.src = URL.createObjectURL(new Blob([captions], { type: 'text/vtt' }));
        video.appendChild(track);
      }
      video.addEventListener('loadedmetadata', () => { video.currentTime = Math.min(position, video.duration); });
      video.addEventListener('timeupdate', () => {
        if (video.currentTime >= lastCheckpoint + 15) {
          lastCheckpoint = video.currentTime;
          send('progress');
        }
      });
      video.addEventListener('pause', () => { if (!video.ended) send('progress'); });
      video.addEventListener('ended', () => send('end'));
      video.addEventListener('error', () => send('error'));
      video.src = url;
    </script></body></html>`;
  return <View style={{ aspectRatio: 16 / 9, backgroundColor: '#000' }}>
    <WebView source={{ html }} originWhitelist={['*']} allowsInlineMediaPlayback allowsFullscreenVideo
      allowFileAccess={false} setSupportMultipleWindows={false} scrollEnabled={false} incognito
      onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
      onError={onError} onMessage={({ nativeEvent }) => {
        const { event, seconds } = JSON.parse(nativeEvent.data);
        if (event === 'error') onError();
        if ((event === 'progress' || event === 'end') && typeof seconds === 'number' && Number.isFinite(seconds)) {
          onProgress(seconds, event === 'end');
        }
      }} />
  </View>;
}
