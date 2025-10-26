
import { GoogleGenAI } from "@google/genai";

// FIX: Removed the duplicate global declaration for `window.aistudio`.
// The type definition is expected to be provided by the execution environment,
// and having it here caused a conflict.

interface GenerateVideoParams {
  prompt: string;
  imageBase64: string;
  imageMimeType: string;
  aspectRatio: '16:9' | '9:16';
  duration: 'short' | 'long';
  onProgress: (message: string) => void;
}

// Helper function to fetch and create a blob URL, reducing code duplication.
const fetchAndCreateUrl = async (downloadLink: string, apiKey: string): Promise<string> => {
    const response = await fetch(`${downloadLink}&key=${apiKey}`);
    if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
    }
    const videoBlob = await response.blob();
    return URL.createObjectURL(videoBlob);
};


export const generateVideoFromImage = async ({
  prompt,
  imageBase64,
  imageMimeType,
  aspectRatio,
  duration,
  onProgress,
}: GenerateVideoParams): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found. Please select an API key.");
  }

  // Create a new instance for each call to ensure the latest key is used.
  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  try {
    onProgress("Warming up the creativity engine...");
    let firstOperation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      image: {
        imageBytes: imageBase64,
        mimeType: imageMimeType,
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: aspectRatio,
      }
    });

    onProgress("Generating initial scene... this can take a few minutes.");
    // Polling for the result
    while (!firstOperation.done) {
      // Wait for 20 seconds before checking the status again to avoid rate limiting.
      await new Promise(resolve => setTimeout(resolve, 20000));
      firstOperation = await ai.operations.getVideosOperation({ operation: firstOperation });
    }
    
    // For long videos, add a short delay to ensure the video is fully processed on the backend before attempting to extend it.
    if (duration === 'long') {
      onProgress("Finalizing initial scene...");
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3-second delay
    }

    if (duration === 'short') {
        const downloadLink = firstOperation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
            throw new Error("Video generation failed: No download link was returned.");
        }
        onProgress("Downloading your video...");
        return fetchAndCreateUrl(downloadLink, apiKey);
    }

    // Logic for long video generation (extension)
    onProgress("Extending video... this will take a few more minutes.");
    const previousVideo = firstOperation.response?.generatedVideos?.[0]?.video;
    if (!previousVideo) {
        throw new Error("Failed to get initial video for extension.");
    }

    let extensionOperation = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview', // Model that supports extension
        prompt: prompt,
        video: previousVideo,
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: aspectRatio,
        }
    });

    while (!extensionOperation.done) {
        // Wait for 20 seconds before checking the status again to avoid rate limiting.
        await new Promise(resolve => setTimeout(resolve, 20000));
        extensionOperation = await ai.operations.getVideosOperation({ operation: extensionOperation });
    }

    const extendedDownloadLink = extensionOperation.response?.generatedVideos?.[0]?.video?.uri;
    if (!extendedDownloadLink) {
        throw new Error("Video extension failed: No download link was returned.");
    }

    onProgress("Downloading your extended video...");
    return fetchAndCreateUrl(extendedDownloadLink, apiKey);

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    // Specifically handle rate limiting (429) errors with a user-friendly message.
    if (error.message && (error.message.includes("RESOURCE_EXHAUSTED") || error.message.includes("429"))) {
        throw new Error("Rate limit exceeded. You've made too many requests in a short period. Please wait a moment and try again.");
    }
    if (error.message && error.message.includes("Requested entity was not found")) {
        throw new Error("API key is invalid or not found. Please re-select your API key.");
    }
    throw new Error(error.message || "An unknown error occurred while communicating with the API.");
  }
};