{/* Resize Handle - EditableText Mimarisi (Kusursuz Animasyon) */}
      <TooltipProvider>
        <Tooltip open={showResizeTooltip}>
          <TooltipTrigger asChild>
            {/* 1. Dış İskelet (EditableText ile aynı border ve geçiş yapısı) */}
            <div
              className={`relative group/resizer w-full block border border-transparent hover:border-red-600 rounded-b print:hidden ${
                isHighlighting ? "" : "transition-colors duration-150"
              }`}
              style={isHighlighting ? { transition: 'none' } : undefined}
              onMouseDown={handleResizeStart}
              onMouseEnter={() => setShowResizeTooltip(true)}
              onMouseLeave={() => setShowResizeTooltip(false)}
            >
              {/* 2. İç Animasyon Alanı (Efekt anında geçişler ve arka plan tamamen iptal edilir) */}
              <div
                className={`no-print h-2 w-full cursor-s-resize flex items-center justify-center outline-none ${
                  isHighlighting 
                    ? "highlight-active bg-transparent" 
                    : "bg-zinc-100 group-hover/resizer:bg-zinc-300 transition-colors duration-150"
                }`}
                style={isHighlighting ? { transition: 'none' } : undefined}
              >
                {/* 3. İç Çizgi (Animasyon anında gizlenir, normalde görünür) */}
                <div className={`w-12 h-0.5 rounded-full ${
                  isHighlighting 
                    ? "bg-transparent" 
                    : "bg-zinc-300 group-hover/resizer:bg-zinc-400 transition-colors duration-150"
                }`} />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-center bg-red-600 border-red-600 text-white px-3 py-[10px] shadow-lg rounded-none">
            <p>Bölümü uzatmak<br />için çizgiden tutup<br />aşağı çekebilirsiniz</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
