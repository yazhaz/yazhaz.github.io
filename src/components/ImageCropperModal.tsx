import React from "react";
import FilerobotImageEditor, { TABS, TOOLS } from "react-filerobot-image-editor";

interface ImageCropperModalProps {
  open: boolean;
  imageSrc: string;
  onClose: () => void;
  onCropComplete: (croppedBase64: string, croppedWidth?: number, croppedHeight?: number) => void;
}

export function ImageCropperModal({ open, imageSrc, onClose, onCropComplete }: ImageCropperModalProps) {
  if (!open || !imageSrc) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4">
      <div className="relative w-full max-w-5xl h-[88vh] bg-white shadow-2xl overflow-hidden flex flex-col border border-zinc-200">
        <FilerobotImageEditor
          source={imageSrc}
          onSave={(savedImageData) => {
            if (savedImageData.imageBase64) {
              onCropComplete(
                savedImageData.imageBase64,
                savedImageData.width || 342,
                savedImageData.height || 160
              );
            }
            onClose();
          }}
          onClose={() => onClose()}
          annotationsCommon={{
            fill: "#ffffff",
            stroke: "#ffffff",
          }}
          tabsIds={[TABS.ADJUST, TABS.FINETUNE, TABS.ANNOTATE]}
          defaultTabId={TABS.ADJUST}
          defaultToolId={TOOLS.CROP}
          useBackendTranslations={false}
          disableSaveIfNoChanges={false}
          closeAfterSave={true}
          defaultSavedImageType="jpeg"
          defaultSavedImageQuality={0.95}
          savingPixelRatio={2}
          previewPixelRatio={typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1}
          translations={{
            save: "Kırp ve Ekle",
            close: "Kapat",
            adjust: "Kırp & Döndür",
            finetune: "Leke Temizle & Ayarla",
            annotate: "Gizle & Çiz",
            crop: "Kırp",
            rotate: "Döndür",
            flipX: "Yatay Çevir",
            flipY: "Dikey Çevir",
            brightness: "Parlaklık",
            contrast: "Kontrast",
            threshold: "Leke Temizle (Eşikleme)",
            rect: "Beyaz Kutu (Maskele)",
            pen: "Daksil Kalemi",
            arrow: "Ok",
            line: "Çizgi",
            ellipse: "Daire",
            cancel: "İptal",
            discardChanges: "Değişiklikleri iptal et",
            apply: "Uygula",
            reset: "Sıfırla",
            undo: "Geri Al",
            redo: "İleri Al",
          }}
        />
      </div>
    </div>
  );
}
