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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4">
      <div className="relative w-full max-w-5xl h-[88vh] bg-white shadow-2xl overflow-hidden flex flex-col border border-zinc-200">
        <FilerobotImageEditor
          source={imageSrc}
          onBeforeSave={() => false}
          defaultSavedImageName="soru"
          defaultSavedImageType="png"
          onSave={(savedImageData: any) => {
            const base64 = savedImageData.imageBase64 || savedImageData.imageCanvas?.toDataURL?.();
            if (base64) {
              onCropComplete(
                base64,
                savedImageData.width || 342,
                savedImageData.height || 160
              );
            }
            onClose();
          }}
          onClose={() => onClose()}
          annotationsCommon={{
            fill: "#1e293b",
            stroke: "#1e293b",
          }}
          Text={{
            fill: "#1e293b",
          }}
          Rect={{
            fill: "#ffffff",
            stroke: "#ffffff",
          }}
          Pen={{
            stroke: "#ffffff",
            strokeWidth: 12,
          }}
          tabsIds={[TABS.ADJUST, TABS.FINETUNE, TABS.ANNOTATE]}
          defaultTabId={TABS.ADJUST}
          defaultToolId={TOOLS.CROP}
          useBackendTranslations={false}
          disableSaveIfNoChanges={false}
          closeAfterSave={true}
          defaultSavedImageQuality={0.95}
          savingPixelRatio={2}
          previewPixelRatio={typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1}
          translations={{
            save: "Kırp ve Ekle",
            cancel: "İptal",
            apply: "Uygula",
            resetOperations: "İşlemleri Sıfırla",
            discardChanges: "Değişiklikleri Sil",
            undoTitle: "Geri Al",
            redoTitle: "İleri Al",
            showImageTitle: "Orijinal Resmi Göster",
            zoomInTitle: "Yakınlaştır",
            zoomOutTitle: "Uzaklaştır",
            toggleZoomMenuTitle: "Yakınlaştırma Menüsü",

            // Sekmeler
            adjustTab: "Ayarla",
            finetuneTab: "İnce Ayar",
            annotateTabLabel: "Açıklama",

            // Ayarla Araçları
            cropTool: "Kesme",
            rotateTool: "Döndürme",
            flipX: "Yatay Çevir",
            flipY: "Dikey Çevir",
            unFlipX: "Yatay Çevir",
            unFlipY: "Dikey Çevir",
            original: "Orijinal",
            custom: "Serbest",
            square: "Kare",
            landscape: "Yatay",
            portrait: "Dikey",

            // İnce Ayar Araçları
            brightnessTool: "Parlaklık",
            contrastTool: "Kontrast",
            saturation: "Doygunluk",
            blurTool: "Bulanıklık",
            warmthTool: "Sıcaklık",
            threshold: "Leke Temizleme / Eşikleme",
            hsvTool: "HSV",
            hue: "Ton",
            value: "Değer",

            // Açıklama Ekle Araçları
            textTool: "Metin",
            imageTool: "Görüntü",
            rectangleTool: "Dikdörtgen",
            ellipseTool: "Elips",
            polygonTool: "Çokgen",
            penTool: "Kalem",
            lineTool: "Çizgi",
            arrowTool: "Ok",
            colorPickerModalTitleLabel: "Renk Seç",

            sides: "Kenar Sayısı",
            cornerRadius: "Köşe Yuvarlama",
            stroke: "Çizgi",
            opacity: "Opaklık",
            shadow: "Gölge",
            horizontal: "Yatay",
            vertical: "Dikey",
            quality: "Kalite",
            width: "Genişlik",
            height: "Yükseklik",
          }}
        />
      </div>
    </div>
  );
}
