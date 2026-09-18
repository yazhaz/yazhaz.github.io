import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, RotateCcw, Mail, FileDown, Plus, X, KeyRound, Upload, AlertTriangle, Sparkles, Loader2, Edit2, Type, Undo2, Search, MoveHorizontal, MoveVertical } from "lucide-react";
import { toJpeg } from "html-to-image";
import jsPDF from "jspdf";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageCropperModal } from "./ImageCropperModal";
import { performOCR } from "@/lib/image-utils";
const STORAGE_KEY = "refine-template-v1";
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

/** Dış ekran zemini */
const SCREEN_CANVAS_BG = "bg-slate-800";
/** "Soru Yükle" — normal / hover (hover, zeminden daha koyu) */
const UPLOAD_BTN_BG = "bg-slate-700";
const UPLOAD_BTN_HOVER = "hover:bg-slate-800";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlockItem {
  id: string;
  text: string;
  content: string; // Asıl soru metni alanı
  image: string;
  height?: number;
  score?: string;
  imageRemoved?: boolean;
}

interface PageData {
  left: BlockItem[];
  right: BlockItem[];
}

interface AnswerKeyData {
  enabled: boolean;
  options: 4 | 5;
  count: number;
}

interface TemplateData {
  headerTitle: string;
  headerSchool: string;
  headerLogo: string;
  page1: PageData;
  page2: PageData;
  answerKey: AnswerKeyData;
}

// ─── Default Data ─────────────────────────────────────────────────────────────

const defaultAnswerKey: AnswerKeyData = {
  enabled: false,
  options: 4,
  count: 15,
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const defaultData: TemplateData = {
  headerTitle: "X. Sınıf Matematik Dersi 2.Dönem 1. Yazılı Sınavı",
  headerSchool: "Mehmet Akif Ortaokulu (202X-202X)",
  headerLogo: "",
  page1: {
    left: [
      { id: "s1", text: "Soru 1", content: "", image: "", score: "Puanı :\u00A0\u00A0\u00A0\u00A0\u00A0" },
      { id: "s2", text: "Soru 2", content: "", image: "", score: "Puanı :\u00A0\u00A0\u00A0\u00A0\u00A0" },
    ],
    right: [
      { id: "s3", text: "Soru 3", content: "", image: "", score: "Puanı :\u00A0\u00A0\u00A0\u00A0\u00A0" },
      { id: "s4", text: "Soru 4", content: "", image: "", score: "Puanı :\u00A0\u00A0\u00A0\u00A0\u00A0" },
    ],
  },
  page2: {
    left: [
      { id: "s5", text: "Soru 5", content: "", image: "", score: "Puanı :\u00A0\u00A0\u00A0\u00A0\u00A0" },
      { id: "s6", text: "Soru 6", content: "", image: "", score: "Puanı :\u00A0\u00A0\u00A0\u00A0\u00A0" },
      { id: "s7", text: "Soru 7", content: "", image: "", score: "Puanı :\u00A0\u00A0\u00A0\u00A0\u00A0" },
    ],
    right: [
      { id: "s8", text: "Soru 8", content: "", image: "", score: "Puanı :\u00A0\u00A0\u00A0\u00A0\u00A0" },
      { id: "s9", text: "Soru 9", content: "", image: "", score: "Puanı :\u00A0\u00A0\u00A0\u00A0\u00A0" },
      { id: "s10", text: "Soru 10", content: "", image: "", score: "Puanı :\u00A0\u00A0\u00A0\u00A0\u00A0" },
    ],
  },
  answerKey: defaultAnswerKey,
};

/** Migrate old flat-array format to new left/right column format */
function migrateOldFormat(raw: unknown): TemplateData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // Already new format
  if (r.page1 && typeof r.page1 === "object" && "left" in (r.page1 as object)) {
    const result = r as unknown as TemplateData;
    // Ensure answerKey exists (may not exist in older saves)
    if (!result.answerKey) {
      result.answerKey = defaultAnswerKey;
    }
    // Ensure headerLogo exists
    if (!result.headerLogo) {
      result.headerLogo = "";
    }
    // Ensure all blocks have ids (may not exist in older saves)
    for (const page of ["page1", "page2"] as const) {
      for (const col of ["left", "right"] as const) {
        result[page][col] = result[page][col].map((b) => ({
          ...b,
          id: b.id || uid(),
          content: b.content || ""
        }));
      }
    }
    return result;
  }

  // Old format: page1 is array[4], page2 is array[6]
  if (Array.isArray(r.page1) && Array.isArray(r.page2)) {
    return {
      headerTitle: typeof r.headerTitle === "string" ? r.headerTitle : defaultData.headerTitle,
      headerSchool: typeof r.headerSchool === "string" ? r.headerSchool : defaultData.headerSchool,
      headerLogo: "",
      page1: {
        left: (r.page1 as BlockItem[]).map(b => ({ ...b, content: b.content || "" })).slice(0, 2),
        right: (r.page1 as BlockItem[]).map(b => ({ ...b, content: b.content || "" })).slice(2, 4),
      },
      page2: {
        left: (r.page2 as BlockItem[]).map(b => ({ ...b, content: b.content || "" })).slice(0, 3),
        right: (r.page2 as BlockItem[]).map(b => ({ ...b, content: b.content || "" })).slice(3, 6),
      },
      answerKey: defaultAnswerKey,
    };
  }

  return null;
}

const PAGE1_MAX_TOTAL = 8;
const PAGE2_MAX_TOTAL = 8;
const ONE_HOUR = 60 * 60 * 1000; // 1 saatlik bekleme süresi

// ─── EditableText ─────────────────────────────────────────────────────────────

interface EditableTextProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  isHighlighting?: boolean;
  tooltipText?: string;
  tooltipSide?: "left" | "right";
}

// Basit HTML sanitize fonksiyonu (XSS koruması)
const sanitizeHTML = (html: string): string => {
  if (!html) return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
};

function EditableText({ value, onChange, className = "", isHighlighting = false, tooltipText, tooltipSide = "left" }: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const divRef = useRef<HTMLDivElement>(null);
  const localEditRef = useRef(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (divRef.current && !editing && !localEditRef.current) {
      if (divRef.current.innerHTML !== (value || "")) {
        divRef.current.innerHTML = value || "";
      }
    }
  }, [value]);

  const commitContent = () => {
    if (divRef.current) {
      localEditRef.current = true;
      const html = sanitizeHTML(divRef.current.innerHTML);
      onChange(html);
      setTimeout(() => { localEditRef.current = false; }, 0);
    }
  };

  const changeFontSize = (delta: number) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    document.execCommand("fontSize", false, "7");
    const fontTags = divRef.current?.querySelectorAll('font[size="7"]');
    
    if (fontTags && fontTags.length > 0) {
      fontTags.forEach(font => {
        let currentSize = 14;
        const parent = font.parentElement;
        if (parent) {
          const style = window.getComputedStyle(parent);
          currentSize = parseFloat(style.fontSize) || 14;
        }
        
        const newSize = Math.max(8, currentSize + delta);
        
        const span = document.createElement("span");
        span.style.fontSize = `${newSize}px`;
        span.innerHTML = font.innerHTML;
        font.parentNode?.replaceChild(span, font);
      });
      if (divRef.current) {
         onChange(sanitizeHTML(divRef.current.innerHTML));
      }
    }
  };

  return (
    <div className={`relative w-full block border rounded-none print:border-0 ${isHighlighting ? "border-red-600" : "border-transparent"}`}
      onMouseEnter={() => {
        if (tooltipText) {
          setShowTooltip(true);
          if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
          tooltipTimerRef.current = setTimeout(() => setShowTooltip(false), 5000);
        }
      }}
      onMouseLeave={() => {
        setShowTooltip(false);
        if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null; }
      }}
    >
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        tabIndex={0}
        onMouseDown={() => {
          setEditing(true);
          setTimeout(() => divRef.current?.focus(), 0);
        }}
        onClick={(e) => {
          setEditing(true);
          e.currentTarget.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              range.deleteContents();
              const br = document.createElement("br");
              range.insertNode(br);
              range.setStartAfter(br);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            }
            return;
          }
          if (e.ctrlKey && e.key === "b") {
            e.preventDefault();
            document.execCommand("bold", false);
          }
          if (e.ctrlKey && e.key === "i") {
            e.preventDefault();
            document.execCommand("italic", false);
          }
          if (e.ctrlKey && e.key.toLowerCase() === "m") {
            e.preventDefault();
            changeFontSize(-2);
          }
          if (e.ctrlKey && e.key.toLowerCase() === "l") {
            e.preventDefault();
            changeFontSize(2);
          }
          if (e.ctrlKey && e.key.toLowerCase() === "o") {
            e.preventDefault();
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

            document.execCommand("fontSize", false, "7");
            const fontTags = divRef.current?.querySelectorAll('font[size="7"]');
            
            if (fontTags && fontTags.length > 0) {
              fontTags.forEach(font => {
                const span = document.createElement("span");
                span.style.fontSize = "14px";
                span.innerHTML = font.innerHTML;
                font.parentNode?.replaceChild(span, font);
              });
              if (divRef.current) {
                onChange(sanitizeHTML(divRef.current.innerHTML));
              }
            }
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          const selection = window.getSelection();
          if (!selection?.rangeCount) return;
          selection.deleteFromDocument();
          selection.getRangeAt(0).insertNode(document.createTextNode(text));
          selection.collapseToEnd();
        }}
        onBlur={() => {
          setEditing(false);
          commitContent();
        }}
        className={[
          `cursor-text whitespace-pre-wrap text-black outline-none w-full block${isHighlighting ? "" : " transition-all"}`,
          editing ? "ring-2 ring-zinc-300 print:ring-0" : "",
          isHighlighting ? "highlight-active" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={isHighlighting ? { transition: 'none' } : undefined}
      />

{tooltipText && showTooltip && (
        <div className={`editable-tooltip print:hidden absolute z-50 top-1/2 -translate-y-1/2 ${tooltipSide === "left" ? "right-full mr-2" : "left-full ml-2"} pointer-events-none flex ${tooltipSide === "left" ? "flex-row-reverse" : "flex-row"} items-center`}>
          <div className={`w-0 h-0 border-t-4 border-b-4 ${tooltipSide === "left" ? "border-l-4 border-r-0 border-t-transparent border-b-transparent border-l-red-600" : "border-r-4 border-l-0 border-t-transparent border-b-transparent border-r-red-600"}`} />
          <div className={`bg-red-600 text-white text-xs px-3 py-[10px] text-left shadow-lg rounded-none whitespace-pre-line ${tooltipText && tooltipText.includes("CTRL") ? "min-w-[200px]" : ""}`}>
            {tooltipText}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LogoUploader (MEB Logo) ───────────────────────────────────────────────────

interface LogoUploaderProps {
  src: string;
  onChange: (val: string) => void;
  isHighlighting?: boolean;
}

function LogoUploader({ src, onChange, isHighlighting = false }: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showErrorTooltip, setShowErrorTooltip] = useState(false);

  const defaultLogo = "https://upload.wikimedia.org/wikipedia/commons/c/cc/Milli_E%C4%9Fitim_Bakanl%C4%B1%C4%9F%C4%B1_Logo.svg";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.png') && !fileName.endsWith('.jpg') && !fileName.endsWith('.jpeg')) {
      setShowErrorTooltip(true);
      setTimeout(() => setShowErrorTooltip(false), 3000);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (img.width === 80 && img.height === 80) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          onChange(ev.target?.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setShowErrorTooltip(true);
        setTimeout(() => setShowErrorTooltip(false), 3000);
      }
    };
    img.onerror = () => {
      setShowErrorTooltip(true);
      setTimeout(() => setShowErrorTooltip(false), 3000);
    };
    img.src = URL.createObjectURL(file);

    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <div 
      className={`w-20 h-20 flex-shrink-0 flex items-center justify-center relative group/logo cursor-pointer ${isHighlighting ? "highlight-active" : ""}`}
      style={isHighlighting ? { transition: 'none' } : undefined}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={handleClick}
    >
      <img 
        src={src || defaultLogo} 
        alt="MEB Logo" 
        className="w-full h-full object-contain group-hover/logo:border-2 group-hover/logo:border-dashed group-hover/logo:border-[#cad5e2]"
      />

      {/* Reset Butonu - Sadece özel logo yüklendiğinde göster - hover'da görünür */}
      {src && (
        <button
          onClick={handleReset}
          className={`print:hidden absolute top-0 left-0 z-30 opacity-0 group-hover/logo:opacity-100 flex items-center justify-center gap-1 bg-red-600 hover:bg-red-700 text-white h-5 text-xs cursor-pointer w-full${isHighlighting ? "" : " transition-opacity"}`}
          style={isHighlighting ? { transition: 'none' } : undefined}
        >
          <Undo2 className="size-3 text-white font-bold" style={{ filter: "drop-shadow(0 0 1px rgba(255,255,255,0.8))" }} />
          <span className="whitespace-nowrap">Kaldır</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Tooltip - Logo yükleme bilgisi */}
      {showTooltip && !showErrorTooltip && (
        <div className="print:hidden absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 pointer-events-none flex flex-col items-center">
          <div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-red-600 shadow-sm" />
          <div className="bg-red-600 text-white text-xs px-3 py-[10px] text-center whitespace-nowrap shadow-lg rounded-none">
            Tıklayarak 80x80 px<br />logo yükleyebilirsiniz
          </div>
        </div>
      )}

      {/* Error Tooltip - Boyut hatası veya uzantı hatası */}
      {showErrorTooltip && (
        <div className="print:hidden absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 pointer-events-none flex flex-col items-center">
          <div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-red-600 shadow-sm" />
          <div className="bg-red-600 text-white text-xs px-3 py-[10px] text-center whitespace-nowrap shadow-lg rounded-none">
            Lütfen 80x80 px<br />PNG veya JPG yükleyiniz
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ImageUploader ────────────────────────────────────────────────────────────

interface ImageUploaderProps {
  src: string;
  onChange: (val: string | ArrayBuffer | null) => void;
  height: number;
  isHighlighting?: boolean;
  onImageLoadComplete?: () => void;
}

function ImageUploader({ src, onChange, height, isHighlighting = false, onImageLoadComplete }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tempSrc, setTempSrc] = useState<string>("");

  return (
    <>
      <div
        className={`relative overflow-hidden bg-white print:bg-white border border-dashed border-zinc-300 group/imgarea:hover:border-zinc-500 flex items-start justify-center ${isHighlighting ? "highlight-active" : "transition-colors duration-150"}`}
        style={{ ...({ height: height } as React.CSSProperties), ...(isHighlighting ? { transition: 'none' } as React.CSSProperties : {}) }}
      >
        {src && <img src={src} className="w-full h-auto max-h-full object-contain" alt="Yüklenen görsel" />}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              setTempSrc(reader.result as string);
              setModalOpen(true);
              if (inputRef.current) inputRef.current.value = "";
            };
            reader.readAsDataURL(file);
          }}
        />
      </div>
      <ImageCropperModal
        open={modalOpen}
        imageSrc={tempSrc}
        onClose={() => setModalOpen(false)}
        onCropComplete={(res) => {
          onChange(res);
          setModalOpen(false);
          onImageLoadComplete?.();
        }}
      />
    </>
  );
}

/** Basit, kompakt resim yükleme butonu (A4 alanından tasarruf için) */
interface CompactImageUploaderProps {
  onImageChange: (val: string | ArrayBuffer | null, width?: number, height?: number) => void;
  isHighlighting?: boolean;
  className?: string;
  onImageLoadComplete?: () => void;
}

function CompactImageUploader({ onImageChange, isHighlighting = false, className = "", onImageLoadComplete }: CompactImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tempSrc, setTempSrc] = useState<string>("");

  return (
    <div
      className={`relative group w-full block border border-transparent rounded-none print:hidden ${isHighlighting ? "" : "transition-colors duration-150"} ${className}`}
      style={isHighlighting ? { transition: 'none' } : undefined}
    >
      <div
  onClick={() => inputRef.current?.click()}
  className={`w-full min-h-[200px] flex flex-col items-center justify-center bg-slate-50/50 border-2 border-dashed border-slate-300 cursor-pointer ${isHighlighting ? "highlight-active" : ""}`}
  style={isHighlighting ? { transition: 'none' } : undefined}
>
        <Button
          size="sm"
          className={`${UPLOAD_BTN_BG} ${UPLOAD_BTN_HOVER} text-white border-transparent cursor-pointer rounded-none gap-2 px-6 h-10 shadow-sm opacity-100${isHighlighting ? "" : " transition-colors duration-150"} upload-btn`}
          style={isHighlighting ? { transition: 'none' } : undefined}
        >
          <Upload className="size-4" />
          Soru yükle
        </Button>
      </div>

      <input
        type="file"
        accept="image/*"
        ref={inputRef}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            setTempSrc(reader.result as string);
            setModalOpen(true);
            if (inputRef.current) inputRef.current.value = "";
          };
          reader.readAsDataURL(file);
        }}
      />

      <ImageCropperModal
        open={modalOpen}
        imageSrc={tempSrc}
        onClose={() => setModalOpen(false)}
        onCropComplete={(res, width, height) => {
          onImageChange(res, width, height);
          onImageLoadComplete?.();
        }}
      />
    </div>
  );
}

// ─── AddBlockZone ─────────────────────────────────────────────────────────────

function AddBlockZone({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="add-block-zone print:hidden" style={{ height: "44px" }}>
      <button
        onClick={onAdd}
        className="w-full h-full border-2 border-dashed border-zinc-400 hover:border-slate-800 rounded-none flex items-center justify-center gap-1 bg-transparent cursor-pointer transition-colors duration-150 group">
        <Plus className="size-3 text-zinc-500 group-hover:text-slate-800" />
        <span className="text-xs text-zinc-500 group-hover:text-slate-800">Buraya blok ekle</span>
      </button>
    </div>
  );
}

// ─── Block Card ───────────────────────────────────────────────────────────────

const DEFAULT_IMAGE_HEIGHT = 160;

interface BlockCardProps {
  item: BlockItem;
  onTextChange: (val: string) => void;
  onContentChange: (val: string) => void;
  onImageChange: (val: string | ArrayBuffer | null) => void;
  onScoreChange: (val: string) => void;
  onHeightChange: (val: number) => void;
  onImageRemovedChange: (val: boolean) => void;
  onOCR: () => void;
  onRemove: () => void;
  maxImageHeight: number;
  isHighlighting?: boolean;
  columnSide: 'left' | 'right';
}

function BlockCard({
  item,
  onTextChange,
  onContentChange,
  onImageChange,
  onScoreChange,
  onHeightChange,
  onImageRemovedChange,
  onOCR,
  onRemove,
  maxImageHeight,
  isHighlighting = false,
  columnSide,
}: BlockCardProps) {
  const [blockHeight, setBlockHeight] = useState<number>(item.height ?? DEFAULT_IMAGE_HEIGHT);
  const [removing, setRemoving] = useState(false);
  const [isOCRProcessing, setIsOCRProcessing] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showEditButton, setShowEditButton] = useState(true);
  const [showResizeTooltip, setShowResizeTooltip] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleEditClick = () => {
    setShowEditButton(false);
    setShowMenu(true);
    setShowResizeTooltip(true);
    setTimeout(() => {
      setShowResizeTooltip(false);
    }, 3000);
  };

  useEffect(() => {
    if (!showMenu && !showEditButton) {
      setTimeout(() => {
        setShowEditButton(true);
      }, 100);
    }
  }, [showMenu, showEditButton]);

  // Menü dışına tıklandığında menüyü kapat
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showMenu && cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  // Sync internal height state with prop updates (important for reloads/resets)
  useEffect(() => {
    if (item.height !== undefined && item.height !== blockHeight) {
      setBlockHeight(item.height);
    }
  }, [item.height]);

  const handleRemove = () => {
    if (cardRef.current) {
      cardRef.current.style.height = cardRef.current.offsetHeight + "px";
    }
    setRemoving(true);
    setTimeout(onRemove, 350);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = blockHeight;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      const newHeight = Math.min(maxImageHeight, Math.max(DEFAULT_IMAGE_HEIGHT, startHeight + delta));
      setBlockHeight(newHeight);
    };

    const finalMouseUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", finalMouseUp);
      document.body.style.userSelect = "";

      // Calculate final height based on the last delta
      const finalDelta = ev.clientY - startY;
      const finalHeight = Math.min(maxImageHeight, Math.max(DEFAULT_IMAGE_HEIGHT, startHeight + finalDelta));
      onHeightChange(finalHeight);
    };

    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", finalMouseUp);
  };

  return (
    <div ref={cardRef} className={`relative group/block bg-white border border-zinc-200 hover:border-red-600 px-3 py-[5px] flex flex-col gap-2 print:border-zinc-200 ${removing ? "overflow-hidden block-removing" : "overflow-visible transition-colors duration-150"} ${!item.content && !item.image ? "print:hidden preview-hidden" : ""} ${!item.content && !item.image && !item.text ? "preview-hidden-empty" : ""}`}>
      {/* Bloku Kaldır - Sol alt köşe, hover'da görünür */}
      <button
        onClick={handleRemove}
className="print:hidden absolute z-20 opacity-0 group-hover/block:opacity-100 transition-opacity duration-200 flex items-center bg-red-600 border-l border-t border-red-700 text-white hover:bg-red-700 h-6 px-2 cursor-pointer"
        style={{ right: 0, bottom: 0 }}
      >
        <X className="size-4" />
        <span className="ml-1.5 text-xs font-semibold">Bloku kaldır</span>
      </button>

      <div className="flex items-center gap-2">
        <EditableText value={item.text} onChange={onTextChange} className="font-bold text-sm text-black" isHighlighting={isHighlighting} tooltipText={"Tıklayarak düzenleyebilirsiniz"} tooltipSide={columnSide === 'left' ? 'left' : 'right'} />
        <div className="ml-auto shrink-0">
          <EditableText
            value={item.score ?? "Puanı :\u00A0\u00A0\u00A0\u00A0\u00A0"}
            onChange={onScoreChange}
            className="text-xs text-gray-500 font-semibold text-right whitespace-nowrap"
isHighlighting={isHighlighting}
            tooltipText={"Tıklayarak düzenleyebilirsiniz"}
            tooltipSide={columnSide === 'left' ? 'left' : 'right'}
          />
        </div>
      </div>
      {item.image ? (
        <div className="relative flex-1">
          {/* Menü - sadece showMenu true olunca görünür */}
          {showMenu && (
            <div className={`print:hidden absolute ${columnSide === 'left' ? 'left-0 -translate-x-full -ml-10' : 'right-0 translate-x-full -mr-10'} top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1 bg-white/90 backdrop-blur-sm border border-zinc-200 rounded-none shadow-lg p-2 min-w-[180px]`}>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white h-7 rounded-none shadow-none gap-1.5 px-3 cursor-pointer justify-start group/ocr"
                onClick={async () => {
                  setIsOCRProcessing(true);
                  try {
                    await onOCR();
                  } finally {
                    setIsOCRProcessing(false);
                  }
                }}
              >
                <Sparkles className="size-3.5 text-white" style={{ animation: "sparkle-magic 1.5s infinite ease-in-out" }} />
                <span className="font-semibold text-xs">Resmi metne dönüştür</span>
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white h-7 rounded-none shadow-none gap-1.5 px-3 cursor-pointer justify-start upload-btn"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setTempImageSrc(reader.result as string);
                      setCropModalOpen(true);
                    };
                    reader.readAsDataURL(file);
                  };
                  input.click();
                }}
              >
                <Upload className="size-3.5" />
                <span className="font-semibold text-xs">Tekrar soru yükle</span>
              </Button>
              {/* Metin bölümü ekle - sadece content boş veya undefined ise göster */}
              {(!item.content || !item.content.trim()) && (
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white h-7 rounded-none shadow-none gap-1.5 px-3 cursor-pointer justify-start"
                  onClick={() => onContentChange("Soru metnini buraya yazın...")}
                >
                  <Type className="size-3.5" />
                  <span className="font-semibold text-xs">Metin bölümü ekle</span>
                </Button>
              )}
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white h-7 rounded-none border border-red-700 shadow-none gap-1.5 px-3 cursor-pointer justify-start"
                onClick={() => {
                  if(window.confirm("Görsel kaldırılacak. Emin misiniz?")) {
                    onImageChange("");
                    onImageRemovedChange(true);
                  }
                }}
              >
                <X className="size-3.5" />
                <span className="font-semibold text-xs">Resmi kaldır</span>
              </Button>
              {/* Ok - Menüden resme uzanan */}
              <div className={`absolute ${columnSide === 'left' ? 'right-0 translate-x-full' : 'left-0 -translate-x-full'} top-1/2 -translate-y-1/2 h-0.5 bg-zinc-400`} style={{ width: "42px" }} />
            </div>
          )}
          <div className="relative overflow-hidden group/imgarea group/block">
            {/* Resmi düzenle butonu - hover'da sol üst köşede - img'nin üzerinde */}
            {showEditButton && (
              <button
                onClick={handleEditClick}
                className="print:hidden absolute top-1 left-1 z-30 opacity-0 group-hover/block:opacity-100 transition-opacity duration-200 flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white h-7 px-2 cursor-pointer"
              >
                <Edit2 className="size-3.5" />
                <span className="font-semibold text-xs">Resmi düzenle</span>
              </button>
            )}
            <ImageUploader key={blockHeight} src={item.image} onChange={onImageChange} height={blockHeight} isHighlighting={isHighlighting} onImageLoadComplete={() => setShowMenu(true)} />
            {isOCRProcessing && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 z-10">
                <Loader2 className="size-6 animate-spin text-slate-600" />
                <span className="text-xs font-medium text-slate-700">Metin okunuyor...</span>
              </div>
            )}
          </div>
        </div>
      ) : item.imageRemoved ? null : (
     <CompactImageUploader 
      onImageChange={(val, width, height) => {
       onImageChange(val);
       if (width && height) {
        const targetWidth = 343;
        const safeWidth = width || 1;
        const safeHeight = height || 160;
        const proportionalHeight = Math.round((safeHeight / safeWidth) * targetWidth);
        const optimalHeight = Math.min(proportionalHeight, safeHeight);
        const finalHeight = Math.min(Math.max(optimalHeight, 80), maxImageHeight);
        setBlockHeight(finalHeight);
        onHeightChange(finalHeight);
       }
      }} 
      isHighlighting={isHighlighting} 
      onImageLoadComplete={() => setShowMenu(true)} 
     />
   )}

      {/* Soru İçeriği (Yazı Altta) */}
      {item.content && item.content.trim() && (
        <div className="px-1 pb-1">
          <EditableText
            value={item.content}
            onChange={onContentChange}
            className="text-sm text-black"
            isHighlighting={isHighlighting}
            tooltipText={"Tıklayarak düzenleyebilirsiniz"}
            tooltipSide={columnSide === 'left' ? 'left' : 'right'}
          />
        </div>
      )}

      {/* Resize Handle - Overlay (Bağımsız Katman) Yöntemi */}
      <TooltipProvider>
        <Tooltip open={showResizeTooltip}>
          <TooltipTrigger asChild>
            <div
              className={`relative no-print h-2 w-full cursor-s-resize bg-zinc-100 border border-transparent rounded-b print:hidden flex items-center justify-center group/resize ${
                isHighlighting ? "highlight-active" : ""
              }`}
              onMouseDown={handleResizeStart}
              onMouseEnter={() => setShowResizeTooltip(true)}
              onMouseLeave={() => setShowResizeTooltip(false)}
              style={isHighlighting ? { transition: 'none' } : undefined}
            >
              {/* Başlıkların kullandığı highlight-pulse-glow animasyonu bu elemana uygulanır. */}
              <div className={`w-12 h-0.5 bg-zinc-300 rounded-full ${isHighlighting ? "" : ""}`} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-center bg-red-600 border-red-600 text-white px-3 py-[10px] shadow-lg rounded-none">
            <p>Bölümü uzatmak<br />için çizgiden tutup<br />aşağı çekebilirsiniz</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      
      {/* Kırpma Modal */}
      <ImageCropperModal
        open={cropModalOpen}
        imageSrc={tempImageSrc}
        onClose={() => setCropModalOpen(false)}
        onCropComplete={(res, width, height) => {
          onImageChange(res);
          const targetWidth = 343;
          const safeWidth = width || 1;
          const safeHeight = height || 160;
          const proportionalHeight = Math.round((safeHeight / safeWidth) * targetWidth);
          
          // Küçük resimleri zorla büyütmemek için optimal yüksekliği buluyoruz
          const optimalHeight = Math.min(proportionalHeight, safeHeight);
          
          // Minimum 80px, maksimum sayfa yüksekliği (maxImageHeight) ile sınırla
          const finalHeight = Math.min(Math.max(optimalHeight, 80), maxImageHeight);
          
          setBlockHeight(finalHeight);
          onHeightChange(finalHeight);
          setCropModalOpen(false);
        }}
      />
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

interface ColumnProps {
  blocks: BlockItem[];
  keyPrefix: string;
  showAddZone: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, key: "text" | "content" | "image" | "score" | "height" | "imageRemoved", value: string | ArrayBuffer | null | number | boolean) => void;
  onOCR: (index: number) => void;
  maxImageHeight: number;
  trailingContent?: React.ReactNode;
  isHighlighting?: boolean;
  resetCounter: number;
  columnSide: 'left' | 'right';
}

function Column({
  blocks,
  keyPrefix,
  showAddZone,
  onAdd,
  onRemove,
  onUpdate,
  onOCR,
  maxImageHeight,
  trailingContent,
  isHighlighting = false,
  resetCounter,
  columnSide,
}: ColumnProps) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
      {blocks.map((item, i) => (
        <React.Fragment key={item.id}>
          <BlockCard
            key={`${item.id}-${resetCounter}`}
            item={item}
            onTextChange={(val) => onUpdate(i, "text", val)}
            onContentChange={(val) => onUpdate(i, "content", val)}
            onImageChange={(val) => onUpdate(i, "image", val)}
            onScoreChange={(val) => onUpdate(i, "score", val)}
            onHeightChange={(val) => onUpdate(i, "height", val)}
            onImageRemovedChange={(val) => onUpdate(i, "imageRemoved", val)}
            onOCR={() => onOCR(i)}
            onRemove={() => onRemove(i)}
            maxImageHeight={maxImageHeight}
            isHighlighting={isHighlighting}
            columnSide={columnSide}
          />
        </React.Fragment>
      ))}
      {trailingContent}
      {showAddZone && <AddBlockZone onAdd={onAdd} />}
    </div>
  );
}

// ─── AnswerKey SVG ────────────────────────────────────────────────────────────

interface AnswerKeySVGProps {
  options: 4 | 5;
  count: number;
}

function AnswerKeySVG({ options, count }: AnswerKeySVGProps) {
  const optionLabels = options === 5 ? ["A", "B", "C", "D", "E"] : ["A", "B", "C", "D"];

  const leftCount = Math.ceil(count / 2);
  const rightCount = Math.floor(count / 2);

  // ── Layout constants (scaled to 60% of original) ──────────────────────────
  const paddingX = 3;
  const paddingY = 2;
  const headerH = 8;
  const rowH = 7;
  const circleR = options === 4 ? 2.15 : 2.5;
  const circleGap = 1; // gap between circles
  const circleStep = circleR * 2 + circleGap;
  const numW = 11; // width reserved for question number (enough for 2-digit numbers)
  const numCircleGap = 1.5; // gap between number and first circle
  const colGap = 4; // gap between the two columns

  // Width of all circles in one row
  const circlesWidth = options * (circleR * 2) + (options - 1) * circleGap;
  // Single column content width
  const colW = numW + numCircleGap + circlesWidth;

  // SVG total dimensions
  const contentW = colW * 2 + colGap;
  const totalW = contentW / 0.8; // 10% outer margin on each side
  const totalH = headerH + paddingY + Math.ceil(count / 2) * rowH + paddingY;

  // Position each column within its own half, shifted left from center
  const halfW = totalW / 2;
  const leftOffsetX = (halfW - colW) * 0.25;
  const rightOffsetX = halfW + (halfW - colW) * 0.25;

  const renderColumn = (startQ: number, qCount: number, offsetX: number) =>
    Array.from({ length: qCount }, (_, i) => {
      const qNum = startQ + i;
      const rowY = headerH + paddingY + i * rowH;
      const cy = rowY + circleR; // vertical center of the row
      const firstCX = offsetX + numW + numCircleGap + circleR;

      return (
        <g key={qNum}>
          {/* Question number */}
          <text
            x={offsetX + numW}
            y={cy + 1}
            textAnchor="end"
            fontSize={options === 4 ? "3.4" : "4"}
            fontFamily="system-ui, sans-serif"
            fill="#000">
            {qNum}.
          </text>

          {/* Option circles */}
          {optionLabels.map((label, li) => {
            const cx = firstCX + li * circleStep;
            return (
              <g key={label}>
                <circle cx={cx} cy={cy} r={circleR} stroke="#a1a1aa" strokeWidth="0.6" fill="white" />
                <text
                  x={cx}
                  y={cy + 1}
                  textAnchor="middle"
                  fontSize={options === 4 ? "2.6" : "3"}
                  fontFamily="system-ui, sans-serif"
                  fill="#000">
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      );
    });

  return (
    <div style={{ width: "100%" }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        viewBox={`0 0 ${totalW} ${totalH}`}
        style={{ display: "block" }}>
        {/* White background */}
        <rect x="0" y="0" width={totalW} height={totalH} fill="white" />

        {/* Outer border */}
        <rect
          x="0.5"
          y="0.5"
          width={totalW - 1}
          height={totalH - 1}
          fill="none"
          stroke="#e4e4e7"
          strokeWidth="1"
          rx="0"
        />

        {/* Header background */}
        <rect x="0" y="0" width={totalW} height={headerH} fill="#f4f4f5" rx="0" />
        {/* Square off bottom corners of header fill */}
        <rect x="0" y={headerH - 4} width={totalW} height={4} fill="#f4f4f5" />
        <line x1="0" y1={headerH} x2={totalW} y2={headerH} stroke="#e4e4e7" strokeWidth="1" />

        {/* Header label */}
        <text
          x={totalW / 2}
          y={headerH / 2 + 1}
          textAnchor="middle"
          fontSize="2.8"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
          fill="#000"
          letterSpacing="0.5">
          CEVAP ANAHTARI
        </text>

        {/* Center divider */}
        <line
          x1={totalW / 2}
          y1={headerH + paddingY}
          x2={totalW / 2}
          y2={totalH - paddingY}
          stroke="#e4e4e7"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* Left column */}
        {renderColumn(1, leftCount, leftOffsetX)}

        {/* Right column */}
        {renderColumn(leftCount + 1, rightCount, rightOffsetX)}
      </svg>
    </div>
  );
}

// ─── AddAnswerKeyZone ─────────────────────────────────────────────────────────

function AddAnswerKeyZone({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="add-answer-key-zone print:hidden" style={{ height: "44px" }}>
      <button
        onClick={onAdd}
        className="w-full h-full border-2 border-dashed border-zinc-400 hover:border-slate-800 rounded-none flex items-center justify-center gap-1 bg-transparent cursor-pointer transition-colors duration-150 group">
        <KeyRound className="size-3 text-zinc-500 group-hover:text-slate-800" />
        <span className="text-xs text-zinc-500 group-hover:text-slate-800">Cevap anahtarı ekle</span>
      </button>
    </div>
  );
}

// ─── AnswerKeyModal ───────────────────────────────────────────────────────────

interface AnswerKeyModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (options: 4 | 5, count: number) => void;
}

function AnswerKeyModal({ open, onClose, onConfirm }: AnswerKeyModalProps) {
  const [selectedOptions, setSelectedOptions] = useState<4 | 5>(4);
  const [countInput, setCountInput] = useState("15");
  const count = Math.min(15, Math.max(5, parseInt(countInput, 10) || 5));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm rounded-none">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-zinc-800">Cevap Anahtarı Oluştur</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Option count */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-zinc-700">Kaç şıklı olsun?</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedOptions(4)}
                className={[
                  "flex-1 py-2 px-3 rounded-none border text-sm font-medium transition-colors cursor-pointer",
                  selectedOptions === 4
                    ? "bg-slate-700 text-white border-slate-700"
                    : "bg-white text-zinc-600 border-zinc-300 hover:border-slate-700",
                ].join(" ")}>
                A B C D
              </button>
              <button
                onClick={() => setSelectedOptions(5)}
                className={[
                  "flex-1 py-2 px-3 rounded-none border text-sm font-medium transition-colors cursor-pointer",
                  selectedOptions === 5
                    ? "bg-slate-700 text-white border-slate-700"
                    : "bg-white text-zinc-600 border-zinc-300 hover:border-slate-700",
                ].join(" ")}>
                A B C D E
              </button>
            </div>
          </div>

          {/* Question count */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="question-count" className="text-sm font-medium text-zinc-700">
              Kaç soruluk olsun?
            </Label>
            <Input
              id="question-count"
              type="number"
              min={5}
              max={15}
              value={countInput}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val > 15) setCountInput("15");
                else setCountInput(e.target.value);
              }}
              onBlur={() => setCountInput(String(count))}
              className="w-full rounded-none"
            />
            <p className="text-xs text-zinc-400">En az 5, en fazla 15 soru</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="cursor-pointer border-slate-600 text-slate-700 hover:bg-slate-700 hover:text-white rounded-none">
            İptal
          </Button>
          <Button
            onClick={() => onConfirm(selectedOptions, count)}
            className="bg-slate-700 hover:bg-slate-600 text-white cursor-pointer rounded-none">
            Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── A4Template (main) ────────────────────────────────────────────────────────

export default function A4Template() {
  const [data, setData] = useState<TemplateData>(defaultData);
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [isHighlightingLocked, setIsHighlightingLocked] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [resetCounter, setResetCounter] = useState(0);
  const [a4MaxImageHeight, setA4MaxImageHeight] = useState<number>(560);
  const [answerKeyModalOpen, setAnswerKeyModalOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [overflowPage1, setOverflowPage1] = useState(false);
  const [overflowPage2, setOverflowPage2] = useState(false);
  const [pagePadding, setPagePadding] = useState<number>(() => {
    const saved = window.localStorage.getItem("page-padding");
    return saved ? parseInt(saved, 10) : 5;
  });
  const [pagePaddingVertical, setPagePaddingVertical] = useState<number>(() => {
    const saved = window.localStorage.getItem("page-padding-vertical");
    return saved ? parseInt(saved, 10) : 5;
  });
  const warningTriggeredSession = useRef(false);

  const triggerWarningCountdown = () => {
    if (!warningTriggeredSession.current) {
      warningTriggeredSession.current = true;
      setTimeout(() => {
        setShowWarningModal(true);
      }, 15000);
    }
  };

  useEffect(() => {
    const hideTime = localStorage.getItem("hide-welcome-message");
    if (!hideTime) {
      // Eğer hafızada kapatma kaydı yoksa göster
      setShowWelcome(true);
    } else {
      const timestamp = parseInt(hideTime, 10);
      const now = Date.now();

      // Eğer hafızada kayıt varsa ama üzerinden 1 saatten fazla geçmişse göster ve kaydı temizle
      if (!isNaN(timestamp) && now - timestamp > ONE_HOUR) {
        setShowWelcome(true);
        localStorage.removeItem("hide-welcome-message");
      } else {
        // Aksi halde gizli kalsın (başlangıç state'i false olduğu için fazladan true set etmiyoruz)
        setShowWelcome(false);
      }
    }
  }, []);

  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const calculateMaxHeight = () => {
      const ref = page1Ref.current ?? page2Ref.current;
      if (ref && ref.offsetHeight > 0) {
        setA4MaxImageHeight(ref.offsetHeight / 2);
      }
    };
    calculateMaxHeight();
    window.addEventListener("resize", calculateMaxHeight);
    return () => window.removeEventListener("resize", calculateMaxHeight);
  }, []);

  useEffect(() => {
    const checkOverflow = () => {
      const measureDiv = document.createElement("div");
      measureDiv.style.height = "297mm";
      measureDiv.style.position = "absolute";
      measureDiv.style.visibility = "hidden";
      measureDiv.style.pointerEvents = "none";
      document.body.appendChild(measureDiv);
      const a4HeightPx = measureDiv.offsetHeight;
      document.body.removeChild(measureDiv);

      const ephemeralSelector = ".add-block-zone, .add-answer-key-zone, .no-print, .cursor-s-resize";
      const hideEls = (root: HTMLElement) => {
        const els = root.querySelectorAll(ephemeralSelector);
        const saved: { el: HTMLElement; prev: string }[] = [];
        els.forEach((el) => {
          const htmlEl = el as HTMLElement;
          saved.push({ el: htmlEl, prev: htmlEl.style.display });
          htmlEl.style.display = "none";
        });
        return saved;
      };
      const restoreEls = (saved: { el: HTMLElement; prev: string }[]) => {
        saved.forEach(({ el, prev }) => { el.style.display = prev; });
      };

      if (page1Ref.current) {
        const saved = hideEls(page1Ref.current);
        setOverflowPage1(page1Ref.current.offsetHeight > a4HeightPx + 1);
        restoreEls(saved);
      }
      if (page2Ref.current) {
        const saved = hideEls(page2Ref.current);
        setOverflowPage2(page2Ref.current.offsetHeight > a4HeightPx + 1);
        restoreEls(saved);
      }
    };

    checkOverflow();
    const interval = setInterval(checkOverflow, 500);
    return () => clearInterval(interval);
  }, [data, pagePadding, pagePaddingVertical]);

  useEffect(() => {
    setIsMounted(true);
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const savedAt = parsed?.savedAt;
        const rawData = parsed?.data ?? parsed;
        if (savedAt && Date.now() - savedAt < THREE_DAYS) {
          const migrated = migrateOldFormat(rawData);
          if (migrated?.page1 && migrated?.page2) {
            setData(migrated);
          } else {
            window.localStorage.removeItem(STORAGE_KEY);
          }
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error("Hafıza yükleme hatası", e);
    }
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    try {
      const payload = { data, savedAt: Date.now() };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error("Hafıza kaydetme hatası", e);
    }
  }, [data, isMounted]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const updateColumnBlock = (
    page: "page1" | "page2",
    col: "left" | "right",
    index: number,
    key: "text" | "content" | "image" | "score" | "height" | "imageRemoved",
    value: string | ArrayBuffer | null | number | boolean,
  ) => {
    setData((prev) => {
      const updated = { ...prev };
      updated[page] = { ...prev[page] };
      updated[page][col] = [...prev[page][col]];
      updated[page][col][index] = { ...updated[page][col][index], [key]: value };
      return updated;
    });
  };

  const handleOCR = async (page: "page1" | "page2", col: "left" | "right", index: number) => {
    const item = data[page][col][index];
    if (!item.image) return;

    try {
      const text = await performOCR(item.image);
      if (text && text.trim()) {
        updateColumnBlock(page, col, index, "content", text.trim());
      }
    } catch (e) {
      console.error("OCR Hatası:", e);
    }
  };

  const autoShrink = () => {
    const measureDiv = document.createElement("div");
    measureDiv.style.height = "297mm";
    measureDiv.style.position = "absolute";
    measureDiv.style.visibility = "hidden";
    measureDiv.style.pointerEvents = "none";
    document.body.appendChild(measureDiv);
    const a4HeightPx = measureDiv.offsetHeight;
    document.body.removeChild(measureDiv);

    const ephemeralSelector = ".add-block-zone, .add-answer-key-zone, .no-print, .cursor-s-resize";
    const hideEls = (root: HTMLElement) => {
      const els = root.querySelectorAll(ephemeralSelector);
      const saved: { el: HTMLElement; prev: string }[] = [];
      els.forEach((el) => {
        const htmlEl = el as HTMLElement;
        saved.push({ el: htmlEl, prev: htmlEl.style.display });
        htmlEl.style.display = "none";
      });
      return saved;
    };
    const restoreEls = (saved: { el: HTMLElement; prev: string }[]) => {
      saved.forEach(({ el, prev }) => { el.style.display = prev; });
    };

    const shrinkPage = (
      page: "page1" | "page2",
      ref: React.RefObject<HTMLDivElement | null>
    ) => {
      if (!ref.current) return false;

      const saved = hideEls(ref.current);
      const currentHeight = ref.current.offsetHeight;
      restoreEls(saved);

      const overflow = currentHeight - a4HeightPx;
      if (overflow <= 0) return false;

      const totalBlockHeight = data[page].left.reduce((sum, b) => sum + (b.height ?? DEFAULT_IMAGE_HEIGHT), 0)
        + data[page].right.reduce((sum, b) => sum + (b.height ?? DEFAULT_IMAGE_HEIGHT), 0);

      if (totalBlockHeight <= 0) return false;

      const scale = Math.max(0.5, (totalBlockHeight - overflow * 1.15) / totalBlockHeight);

      setData((prev) => {
        const updated = { ...prev };
        updated[page] = { ...prev[page] };
        for (const col of ["left", "right"] as const) {
          updated[page][col] = prev[page][col].map((block) => {
            const h = block.height ?? DEFAULT_IMAGE_HEIGHT;
            const newH = Math.max(60, Math.round(h * scale));
            return { ...block, height: newH };
          });
        }
        return updated;
      });
      return true;
    };

    const p1 = shrinkPage("page1", page1Ref);
    const p2 = shrinkPage("page2", page2Ref);
    if (!p1 && !p2) {
      setPagePaddingVertical((prev) => {
        const next = prev <= 5 ? 5 : prev - 2;
        window.localStorage.setItem("page-padding-vertical", next.toString());
        return next;
      });
    }
  };

  const removeBlock = (page: "page1" | "page2", col: "left" | "right", index: number) => {
    setData((prev) => {
      const updated = { ...prev };
      updated[page] = { ...prev[page] };
      updated[page][col] = prev[page][col].filter((_, i) => i !== index);
      return updated;
    });
  };

  const COL_MAX = 4;

  const addBlock = (page: "page1" | "page2", col: "left" | "right") => {
    if (data[page][col].length >= COL_MAX) return;

    const nextNum =
      data.page1.left.length + data.page1.right.length + data.page2.left.length + data.page2.right.length + 1;

    const newBlock: BlockItem = {
      id: uid(),
      text: `Soru ${nextNum}`,
      content: "",
      image: "",
      score: "Puanı :\u00A0\u00A0\u00A0\u00A0\u00A0",
    };

    setData((prev) => {
      const updated = { ...prev };
      updated[page] = { ...prev[page] };
      updated[page][col] = [...prev[page][col], newBlock];
      return updated;
    });
  };

  const handleAddAnswerKey = (options: 4 | 5, count: number) => {
    setData((prev) => ({ ...prev, answerKey: { enabled: true, options, count } }));
    setAnswerKeyModalOpen(false);
  };

  const handleRemoveAnswerKey = () => {
    setData((prev) => ({ ...prev, answerKey: { ...prev.answerKey, enabled: false } }));
  };

  // ── Limit checks ──────────────────────────────────────────────────────────

  const canAddPage1Left = data.page1.left.length < COL_MAX;
  const canAddPage1Right = data.page1.right.length < COL_MAX;
  const canAddPage2Left = data.page2.left.length < COL_MAX;
  const canAddPage2Right = data.page2.right.length < COL_MAX;

  // ── PDF / Print ───────────────────────────────────────────────────────────

  const savePdf = async () => {
    triggerWarningCountdown();
    if (!page1Ref.current || !page2Ref.current) return;
    setIsPdfGenerating(true);
    document.body.classList.add("pdf-generating");
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      const options = { pixelRatio: 2, backgroundColor: "#ffffff", cacheBuster: Date.now(), quality: 0.95 };
      const [img1, img2] = await Promise.all([
        toJpeg(page1Ref.current, options),
        toJpeg(page2Ref.current, options)
      ]);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      pdf.addImage(img1, "JPEG", 0, 0, 210, 297, undefined, "FAST");
      pdf.addPage();
      pdf.addImage(img2, "JPEG", 0, 0, 210, 297, undefined, "FAST");

      const fileName = data.headerTitle ? `${data.headerTitle.trim()}.pdf` : "sablonA4.pdf";
      pdf.save(fileName);
    } catch (e) {
      console.error("PDF oluşturma hatası:", e);
    } finally {
      document.body.classList.remove("pdf-generating");
      setIsPdfGenerating(false);
    }
  };

  const handlePrint = () => {
    triggerWarningCountdown();
    document.body.setAttribute("data-print", "true");
    window.print();
    document.body.removeAttribute("data-print");
  };

  const getPagePaddingLabel = () => {
    if (pagePadding === 5) return "%100";
    if (pagePadding === 10) return "%95";
    return "%90";
  };

  const handleTogglePadding = () => {
    setPagePadding((prev) => {
      if (prev === 5) return 10;
      if (prev === 10) return 15;
      return 5;
    });
  };

  const getPagePaddingVerticalLabel = () => {
    if (pagePaddingVertical === 5) return "%100";
    if (pagePaddingVertical === 10) return "%95";
    return "%90";
  };

  const handleTogglePaddingVertical = () => {
    setPagePaddingVertical((prev) => {
      if (prev === 5) return 10;
      if (prev === 10) return 15;
      return 5;
    });
  };

  useEffect(() => {
    window.localStorage.setItem("page-padding", pagePadding.toString());
  }, [pagePadding]);

  useEffect(() => {
    window.localStorage.setItem("page-padding-vertical", pagePaddingVertical.toString());
  }, [pagePaddingVertical]);

  return (
    <div className={`screen-wrapper min-h-screen ${SCREEN_CANVAS_BG} font-sans flex flex-col items-center py-10 px-4 ${previewMode ? "preview-mode" : ""}`}>
      {/* Preview Mode Warning Banner */}
      {previewMode && (
        <div className="fixed top-6 left-6 z-[60] flex flex-col gap-2 bg-white border-2 border-red-600 shadow-xl p-4 w-[200px] animate-fade-in">
          <div className="flex justify-between items-start mb-1">
            <h3 className="font-bold text-red-600 text-sm">Dikkat !</h3>
            <button onClick={() => setPreviewMode(false)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer p-0.5">
              <X className="size-4" />
            </button>
          </div>
          <p className="text-zinc-700 text-sm mb-2">
            Şu an <strong>"Önizleme"</strong> görünümündesiniz. Düzenlemeye devam etmek için <strong>"Önizlemeyi kapat"</strong> butonuna tıklayınız.
          </p>
          <Button onClick={() => setPreviewMode(false)} className="bg-red-600 text-white hover:bg-red-700 hover:scale-105 rounded-none text-xs py-1 transition-transform cursor-pointer">
            Önizlemeyi kapat
          </Button>
        </div>
      )}

      {/* Pages container */}
      <div className="a4-print-area flex flex-col gap-6 relative">
        {/* Preview Mode Overlay - hover ve düzenlemeyi engellemek için */}
        {previewMode && (
          <div className="absolute inset-0 z-50 pointer-events-auto cursor-default" title="" />
        )}
        {/* ── Page 1 ── */}
        <div
          ref={page1Ref}
          className="a4-page bg-white border border-zinc-200 shadow-md"
          style={{
            width: "210mm",
            minHeight: "297mm",
            padding: `${pagePaddingVertical}mm ${pagePadding}mm`,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
          }}>
          {/* Title */}
          <div className="page-header border-b border-zinc-200 pb-4 mb-6 flex flex-row gap-4 items-start">
            <LogoUploader
              src={data.headerLogo}
              onChange={(val) => setData((prev) => ({ ...prev, headerLogo: val }))}
              isHighlighting={isHighlighting}
            />

            <div className="flex-1 flex flex-col items-start gap-1">
<EditableText
                value={data.headerTitle}
                onChange={(val) => setData((prev) => ({ ...prev, headerTitle: val }))}
                className="text-xl font-bold text-black leading-tight w-full"
                isHighlighting={isHighlighting}
                tooltipText={"Bu bölüme tıklayarak\ndüzenleyebilirsiniz."}
                tooltipSide="left"
              />
              <EditableText
                value={data.headerSchool}
                onChange={(val) => setData((prev) => ({ ...prev, headerSchool: val }))}
                className="text-xl font-semibold text-black leading-tight w-full"
                isHighlighting={isHighlighting}
                tooltipText={"Bu bölüme tıklayarak\ndüzenleyebilirsiniz."}
                tooltipSide="left"
              />
              <div className="flex flex-row w-full mt-1">
                <span className="w-[50%] text-base font-semibold text-black border-r border-zinc-300 pr-2">
                  Ad Soyad:
                </span>
                <span className="w-[30%] text-base font-semibold text-black border-r border-zinc-300 px-2">
                  Öğrenci No:
                </span>
                <span className="w-[20%] text-base font-semibold text-black pl-2">Sınıfı:</span>
              </div>
            </div>
          </div>

          {/* 2-column grid */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "16px",
              flex: 1,
              alignItems: "flex-start",
            }}>
            <Column
              blocks={data.page1.left}
              keyPrefix="p1-left"
              showAddZone={canAddPage1Left}
              onAdd={() => addBlock("page1", "left")}
              onRemove={(i) => removeBlock("page1", "left", i)}
              onUpdate={(i, key, val) => updateColumnBlock("page1", "left", i, key, val)}
              onOCR={(i) => handleOCR("page1", "left", i)}
              maxImageHeight={a4MaxImageHeight}
              isHighlighting={isHighlighting}
              resetCounter={resetCounter}
              columnSide="left"
            />
            <Column
              blocks={data.page1.right}
              keyPrefix="p1-right"
              showAddZone={canAddPage1Right}
              onAdd={() => addBlock("page1", "right")}
              onRemove={(i) => removeBlock("page1", "right", i)}
              onUpdate={(i, key, val) => updateColumnBlock("page1", "right", i, key, val)}
              onOCR={(i) => handleOCR("page1", "right", i)}
              maxImageHeight={a4MaxImageHeight}
              isHighlighting={isHighlighting}
              resetCounter={resetCounter}
              columnSide="right"
            />
          </div>
        </div>

        {overflowPage1 && (
            <div className="print:hidden flex items-center gap-2 bg-red-50 border-2 border-red-500 text-red-700 px-4 py-3 rounded-none shadow-md max-w-[210mm] w-full mx-auto mt-2 animate-fade-in">
              <AlertTriangle className="size-5 shrink-0" />
              <span className="text-sm font-semibold flex-1">1. Sayfa A4'e sığmıyor! Blok yüksekliklerini azaltın veya kenar boşluklarını daraltın.</span>
              <Button onClick={autoShrink} className="bg-red-600 text-white hover:bg-red-700 rounded-none text-xs px-3 py-1.5 cursor-pointer shrink-0">
                Otomatik daralt
              </Button>
            </div>
          )}

          {/* ── Page 2 ── */}
        <div
          ref={page2Ref}
          className="a4-page bg-white border border-zinc-200 shadow-md"
          style={{
            width: "210mm",
            minHeight: "297mm",
            padding: `${pagePaddingVertical}mm ${pagePadding}mm`,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
          }}>
          {/* 2-column grid */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "16px",
              alignItems: "flex-start",
            }}>
            <Column
              blocks={data.page2.left}
              keyPrefix="p2-left"
              showAddZone={canAddPage2Left}
              onAdd={() => addBlock("page2", "left")}
              onRemove={(i) => removeBlock("page2", "left", i)}
              onUpdate={(i, key, val) => updateColumnBlock("page2", "left", i, key, val)}
              onOCR={(i) => handleOCR("page2", "left", i)}
              maxImageHeight={a4MaxImageHeight}
              isHighlighting={isHighlighting}
              resetCounter={resetCounter}
              columnSide="left"
            />
            <Column
              blocks={data.page2.right}
              keyPrefix="p2-right"
              showAddZone={canAddPage2Right}
              onAdd={() => addBlock("page2", "right")}
              onRemove={(i) => removeBlock("page2", "right", i)}
              onUpdate={(i, key, val) => updateColumnBlock("page2", "right", i, key, val)}
              onOCR={(i) => handleOCR("page2", "right", i)}
              maxImageHeight={a4MaxImageHeight}
              isHighlighting={isHighlighting}
              resetCounter={resetCounter}
              columnSide="right"
              trailingContent={
                !data.answerKey.enabled ? (
                  <AddAnswerKeyZone onAdd={() => setAnswerKeyModalOpen(true)} />
                ) : (
                  <div className="relative group/answerkey w-full" style={{ boxSizing: "border-box" }}>
                    {/* Remove button */}
                    <button
                      onClick={handleRemoveAnswerKey}
                      className="print:hidden absolute z-20 opacity-0 group-hover/answerkey:opacity-100 transition-opacity duration-200 flex items-center gap-0.5 bg-red-600 border border-red-700 text-white hover:bg-red-700 rounded-none px-2 py-1 text-xs cursor-pointer"
                      style={{ right: "4px", top: "-28px" }}
                      title="Cevap anahtarını kaldır">
                      <X className="size-3" />
                      <span>Cevap anahtarını kaldır</span>
                    </button>
                    <div className="bg-white w-full" style={{ boxSizing: "border-box" }}>
                      <AnswerKeySVG options={data.answerKey.options} count={data.answerKey.count} />
                    </div>
                  </div>
                )
              }
            />
          </div>
          </div>

          {overflowPage2 && (
            <div className="print:hidden flex items-center gap-2 bg-red-50 border-2 border-red-500 text-red-700 px-4 py-3 rounded-none shadow-md max-w-[210mm] w-full mx-auto mt-2 animate-fade-in">
              <AlertTriangle className="size-5 shrink-0" />
              <span className="text-sm font-semibold flex-1">2. Sayfa A4'e sığmıyor! Blok yüksekliklerini azaltın veya kenar boşluklarını daraltın.</span>
              <Button onClick={autoShrink} className="bg-red-600 text-white hover:bg-red-700 rounded-none text-xs px-3 py-1.5 cursor-pointer shrink-0">
                Otomatik daralt
              </Button>
            </div>
          )}
        </div>

      {/* ── Welcome Banner ── */}
      {showWelcome && (
        <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 bg-white border border-zinc-200 shadow-xl p-4 print:hidden w-[220px]">
          <div className="flex justify-between items-start mb-1">
            <h3 className="font-semibold text-sm text-zinc-800">Bilgilendirme</h3>
            <button 
              onClick={() => {
                const now = Date.now().toString();
                localStorage.setItem("hide-welcome-message", now);
                setShowWelcome(false);
              }} 
              className="text-zinc-400 hover:text-zinc-600 cursor-pointer p-1"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="text-sm text-zinc-600 leading-relaxed text-left">
            Yazılı sınav hazırlama aracımızda bazı başlıklar ve bölümler isteğinize göre düzenlenebilir özelliktedir{" "}
            (<span 
              className="text-red-600 font-bold cursor-pointer underline decoration-dotted transition-colors duration-500 ease-in-out hover:text-red-800"
              onMouseEnter={() => setIsHighlighting(true)}
              onMouseLeave={() => {
                if (!isHighlightingLocked) setIsHighlighting(false);
              }}
              onClick={() => {
                const nextLocked = !isHighlightingLocked;
                setIsHighlightingLocked(nextLocked);
                setIsHighlighting(nextLocked);
              }}
              title="Tıklayarak vurgulamayı sabitleyebilirsiniz"
            >
              Bölümleri gör
            </span>
            ). Üye olmadan <strong>resim yükleme, resim kırma, resimlerdeki soruları otomatik olarak yazıya dönüştüme</strong>, pdf alma işlemleri yapabilirsiniz.
          </p>
        </div>
      )}

      {/* ── Answer Key Modal ── */}
      <AnswerKeyModal
        open={answerKeyModalOpen}
        onClose={() => setAnswerKeyModalOpen(false)}
        onConfirm={handleAddAnswerKey}
      />

      {/* ── Floating Action Menu ── */}
      <TooltipProvider>
        <div className="floating-action-menu fixed bottom-6 right-6 z-50 grid grid-cols-2 gap-2 bg-white/90 backdrop-blur-sm border border-zinc-200 rounded-none shadow-lg p-3 print:hidden min-w-[220px]">
          {/* 01 - Yatay ölçeklendirme */}
          <Button onClick={handleTogglePadding} variant="outline" className="gap-2 cursor-pointer justify-start rounded-none" title="Yatay daralt/genişlet">
            <MoveHorizontal className="size-4 shrink-0" />
            {getPagePaddingLabel()}
          </Button>
          {/* 02 - Dikey ölçeklendirme */}
          <Button onClick={handleTogglePaddingVertical} variant="outline" className="gap-2 cursor-pointer justify-start rounded-none" title="Dikey daralt/genişlet">
            <MoveVertical className="size-4 shrink-0" />
            {getPagePaddingVerticalLabel()}
          </Button>

          {/* 03 - Önizle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  onClick={() => setPreviewMode(!previewMode)} 
                  variant="outline" 
                  className={`gap-2 cursor-pointer justify-start rounded-none ${previewMode ? "bg-red-600 border-red-600 text-white hover:bg-red-700" : ""}`}
                >
                  {previewMode ? <X className="size-4 shrink-0" /> : <Search className="size-4 shrink-0" />}
                  Önizle
                </Button>
              </TooltipTrigger>
              {previewMode && (
                <TooltipContent side="bottom" className="text-center bg-slate-800 border-slate-800 text-white px-3 py-[10px] shadow-lg rounded-none">
                  <p>Sayfayı düzenlemeye devam etmek<br />için butona tıklayınız</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          {/* 04 - Yazdır */}
          <Button onClick={handlePrint} variant="outline" className="gap-2 cursor-pointer justify-start rounded-none">
            <Printer className="size-4 shrink-0" />
            Yazdır
          </Button>

          {/* 05 - PDF olarak kaydet */}
          <Button onClick={savePdf} variant="outline" className={`gap-2 col-span-2 cursor-pointer justify-start rounded-none ${isPdfGenerating ? "opacity-70" : ""}`}>
            {isPdfGenerating ? (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin" />
                <span>Hazırlanıyor...</span>
              </>
            ) : (
              <>
                <FileDown className="size-4 shrink-0" />
                <span>PDF olarak kaydet</span>
              </>
            )}
          </Button>

          {/* 06 - E-posta ile gönder */}
          <Button asChild variant="outline" className="gap-2 col-span-2 cursor-pointer justify-start rounded-none">
            <a href={`mailto:?subject=${encodeURIComponent("🗎 Yazılı Sınav Kağıdı Hazırlama Aracı")}&body=${encodeURIComponent("Merhaba, bu şablonu seninle paylaşmak istedim.")}`}>
              <Mail className="size-4 shrink-0" />
              E-posta ile gönder
            </a>
          </Button>

          {/* 07 - Değişiklikleri sıfırla */}
          <Button
            variant="outline"
            onClick={() => {
              if (window.confirm("Tüm değişiklikler silinecek. Emin misiniz?")) {
                window.localStorage.removeItem(STORAGE_KEY);
                setData(defaultData);
                setResetCounter(prev => prev + 1);
              }
            }}
            className="gap-2 col-span-2 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-400 cursor-pointer justify-start rounded-none"
          >
            <RotateCcw className="size-4 shrink-0" />
            Değişiklikleri sıfırla
          </Button>
        </div>
      </TooltipProvider>

      {/* ── Auto Warning Modal ── */}
      <Dialog open={showWarningModal} onOpenChange={setShowWarningModal}>
        <DialogContent className="max-w-2xl rounded-none border-t-8 border-t-slate-700 border-zinc-200 shadow-2xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="flex items-center justify-center gap-3 text-slate-700 text-2xl font-bold">
              <AlertTriangle className="size-8 text-slate-700" />
              ÖNEMLİ GÜVENLİK UYARISI
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-base text-zinc-800 font-medium leading-relaxed text-center">
            Sayfada yaptığınız değişiklikler ve yüklediğiniz resimler 3 gün boyunca tarayıcınızın hafızasında kayıtlı kalacaktır. <br/>
            Yanlışlıkla sayfanın yenilenmesi veya tarayıcınızı kapatmanız durumunda yaptıklarınızın kaybolmaması için 3 gün saklama özelliği eklenmiştir.<br/><br/>
            Çalıştığınız bilgisayar herkese açık bir bilgisayarsa ayrılmadan mutlaka "<strong className="text-red-600 font-extrabold px-1">Değişiklikleri sıfırla</strong>" butonuna tıklayınız!
          </div>
          <DialogFooter className="mt-6 flex sm:justify-center w-full">
            <Button onClick={() => setShowWarningModal(false)} className="rounded-none bg-slate-700 hover:bg-slate-600 text-white cursor-pointer px-8 py-4 text-base font-bold w-auto">
              Anladım
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
