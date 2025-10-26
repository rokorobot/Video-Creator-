import React, { useState, useEffect, useCallback, useRef } from 'react';
import { generateVideoFromImage } from './services/geminiService';
import { Spinner } from './components/Spinner';
import { LandscapeIcon, PortraitIcon, UploadIcon, MediaIcon, WarningIcon, ClockIcon, ClockPlusIcon } from './components/icons';

type AspectRatio = '16:9' | '9:16';
type VideoDuration = 'short' | 'long';
type MediaType = 'image' | 'video' | null;

// Helper to convert a file to a base64 string
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

// Helper to extract the first frame from a video file as a base64 string
const extractFrameFromVideo = (videoFile: File): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = URL.createObjectURL(videoFile);
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      video.currentTime = 0;
    };

    video.onseeked = () => {
      // A small delay can help ensure the frame is fully rendered before capturing.
      window.setTimeout(() => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(video.src);
          return reject(new Error('Could not get canvas context'));
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        URL.revokeObjectURL(video.src);

        const dataUrl = canvas.toDataURL('image/jpeg');
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg' });
      }, 200);
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video file. Ensure it is a valid format.'));
    };

    // Start loading the video by trying to play it.
    video.play().catch(() => {
        // Autoplay can be blocked, but loadeddata should still fire.
    });
  });
};


const App: React.FC = () => {
  const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [duration, setDuration] = useState<VideoDuration>('short');
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const checkApiKey = useCallback(async () => {
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setApiKeySelected(hasKey);
    } else {
        console.warn("aistudio context not available. Assuming API key is set via environment.");
        setApiKeySelected(true);
    }
  }, []);

  useEffect(() => {
    checkApiKey();
  }, [checkApiKey]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setError(null);
      setGeneratedVideoUrl(null);
      setMediaFile(file);

      if (file.type.startsWith('image/')) {
        setMediaType('image');
      } else if (file.type.startsWith('video/')) {
        setMediaType('video');
      } else {
        setMediaType(null);
        setError("Unsupported file type. Please upload an image or a video.");
        return;
      }

      setMediaPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleGenerateClick = async () => {
    if (!prompt || !mediaFile) {
      setError("Please provide a prompt and upload a file.");
      return;
    }
    
    setLoadingMessage('');
    setIsLoading(true);
    setError(null);
    setGeneratedVideoUrl(null);

    try {
      let imageBase64: string;
      let imageMimeType: string;

      if (mediaType === 'video') {
        onProgress: setLoadingMessage("Extracting first frame from video...");
        const frameData = await extractFrameFromVideo(mediaFile);
        imageBase64 = frameData.base64;
        imageMimeType = frameData.mimeType;
      } else if (mediaType === 'image') {
        imageBase64 = await fileToBase64(mediaFile);
        imageMimeType = mediaFile.type;
      } else {
         throw new Error("Invalid media type selected.");
      }

      const videoUrl = await generateVideoFromImage({
        prompt,
        imageBase64,
        imageMimeType,
        aspectRatio,
        duration,
        onProgress: setLoadingMessage,
      });
      setGeneratedVideoUrl(videoUrl);
    } catch (e: any) {
        if (e.message.includes("API key")) {
             setError("API Key error. Please re-select your API key.");
             setApiKeySelected(false);
        } else {
            setError(e.message || "An unknown error occurred during video generation.");
        }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectKey = async () => {
     if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
        await window.aistudio.openSelectKey();
        setApiKeySelected(true);
        setError(null);
     }
  };
  
  if (!apiKeySelected) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-slate-100 p-4">
            <div className="w-full max-w-md bg-slate-800 p-8 rounded-lg shadow-2xl text-center">
                <h1 className="text-2xl font-bold text-cyan-400 mb-4">Welcome to Veo Video Creator</h1>
                <p className="text-slate-300 mb-6">To generate videos, you need to select a Google AI API key. This key will be used for all requests.</p>
                <button
                    onClick={handleSelectKey}
                    className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg transition duration-300 ease-in-out transform hover:scale-105"
                >
                    Select API Key
                </button>
                <p className="text-xs text-slate-400 mt-4">
                    For information on billing, please visit the{' '}
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-cyan-400">
                        official documentation
                    </a>.
                </p>
                {error && <p className="text-red-400 mt-4 text-sm">{error}</p>}
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
            Veo Video Creator
          </h1>
          <p className="mt-2 text-slate-400">Transform your images and videos into new animated scenes.</p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Controls Column */}
          <div className="bg-slate-800/50 p-6 rounded-2xl shadow-lg flex flex-col gap-6">
            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-slate-300 mb-2">1. Your Creative Prompt</label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., A cinematic aerial shot of the city at sunset, with dramatic clouds"
                className="w-full h-32 p-3 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-colors"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">2. Upload Image or Video</label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png, image/jpeg, image/webp, video/mp4"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-slate-700 hover:bg-slate-600 rounded-lg border border-dashed border-slate-500 transition-colors"
              >
                <UploadIcon />
                <span>{mediaFile ? mediaFile.name : 'Choose an image or video'}</span>
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">3. Select Aspect Ratio</label>
              <div className="grid grid-cols-2 gap-4">
                  <button
                      onClick={() => setAspectRatio('16:9')}
                      className={`flex flex-col items-center justify-center gap-2 py-4 rounded-lg transition-all ${aspectRatio === '16:9' ? 'bg-cyan-500/20 ring-2 ring-cyan-500 text-cyan-400' : 'bg-slate-700 hover:bg-slate-600'}`}
                  >
                      <LandscapeIcon />
                      <span className="font-semibold">16:9</span>
                      <span className="text-xs text-slate-400">Landscape</span>
                  </button>
                   <button
                      onClick={() => setAspectRatio('9:16')}
                      className={`flex flex-col items-center justify-center gap-2 py-4 rounded-lg transition-all ${aspectRatio === '9:16' ? 'bg-cyan-500/20 ring-2 ring-cyan-500 text-cyan-400' : 'bg-slate-700 hover:bg-slate-600'}`}
                  >
                      <PortraitIcon />
                      <span className="font-semibold">9:16</span>
                      <span className="text-xs text-slate-400">Portrait</span>
                  </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">4. Select Video Length</label>
              <div className="grid grid-cols-2 gap-4">
                  <button
                      onClick={() => setDuration('short')}
                      className={`flex flex-col items-center justify-center gap-2 py-4 rounded-lg transition-all ${duration === 'short' ? 'bg-cyan-500/20 ring-2 ring-cyan-500 text-cyan-400' : 'bg-slate-700 hover:bg-slate-600'}`}
                  >
                      <ClockIcon />
                      <span className="font-semibold">Short</span>
                      <span className="text-xs text-slate-400">(~4-5s)</span>
                  </button>
                   <button
                      onClick={() => setDuration('long')}
                      className={`flex flex-col items-center justify-center gap-2 py-4 rounded-lg transition-all ${duration === 'long' ? 'bg-cyan-500/20 ring-2 ring-cyan-500 text-cyan-400' : 'bg-slate-700 hover:bg-slate-600'}`}
                  >
                      <ClockPlusIcon />
                      <span className="font-semibold">Long</span>
                      <span className="text-xs text-slate-400">(~11-12s)</span>
                  </button>
              </div>
            </div>

            <button
              onClick={handleGenerateClick}
              disabled={isLoading || !prompt || !mediaFile}
              className="w-full py-3 px-4 font-bold text-white bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg hover:from-cyan-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
            >
              {isLoading ? 'Generating...' : 'Generate Video'}
            </button>
            {error && (
                <div className="bg-red-500/10 text-red-400 text-sm p-3 rounded-lg flex items-start gap-2">
                    <WarningIcon />
                    <span>{error}</span>
                </div>
            )}
          </div>

          {/* Video Display Column */}
          <div className="bg-slate-800/50 p-2 rounded-2xl shadow-lg flex items-center justify-center aspect-video">
            <div className="w-full h-full bg-slate-900 rounded-xl flex items-center justify-center overflow-hidden">
              {isLoading ? (
                <div className="text-center">
                  <Spinner />
                  <p className="mt-4 text-slate-300">{loadingMessage}</p>
                </div>
              ) : generatedVideoUrl ? (
                <video
                  src={generatedVideoUrl}
                  controls
                  autoPlay
                  loop
                  className="w-full h-full object-contain"
                />
              ) : mediaPreviewUrl ? (
                mediaType === 'image' ? (
                  <img src={mediaPreviewUrl} alt="Uploaded preview" className="max-h-full max-w-full object-contain rounded-lg" />
                ) : (
                  <video src={mediaPreviewUrl} controls muted loop className="max-h-full max-w-full object-contain rounded-lg" />
                )
              ) : (
                <div className="text-center text-slate-500 flex flex-col items-center gap-4">
                  <MediaIcon />
                  <p>Your generated video will appear here</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
