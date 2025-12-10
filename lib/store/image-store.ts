import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  model: string;
  size: string;
  steps: number;
  guidanceScale: number;
  seed?: number;
  cost?: number;
  createdAt: number;
  sourceImageUrl?: string; // For img2img
}

interface ImageState {
  images: GeneratedImage[];
  selectedImageId: string | null;
  isGenerating: boolean;
  generationError: string | null;

  addImage: (image: GeneratedImage) => void;
  removeImage: (id: string) => void;
  clearAllImages: () => void;
  setSelectedImageId: (id: string | null) => void;
  setIsGenerating: (value: boolean) => void;
  setGenerationError: (error: string | null) => void;
}

export const useImageStore = create<ImageState>()(
  persist(
    (set) => ({
      images: [],
      selectedImageId: null,
      isGenerating: false,
      generationError: null,

      addImage: (image) =>
        set((state) => ({
          images: [image, ...state.images],
        })),

      removeImage: (id) =>
        set((state) => ({
          images: state.images.filter((img) => img.id !== id),
          selectedImageId:
            state.selectedImageId === id ? null : state.selectedImageId,
        })),

      clearAllImages: () =>
        set({
          images: [],
          selectedImageId: null,
        }),

      setSelectedImageId: (id) => set({ selectedImageId: id }),
      setIsGenerating: (value) => set({ isGenerating: value }),
      setGenerationError: (error) => set({ generationError: error }),
    }),
    {
      name: "image-gallery-storage",
      partialize: (state) => ({
        images: state.images,
      }),
    },
  ),
);
