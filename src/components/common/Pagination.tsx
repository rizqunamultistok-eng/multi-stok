import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight 
} from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  itemName?: string;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  pageSize,
  pageSizeOptions = [25, 50, 100, 150, 200],
  onPageChange,
  onPageSizeChange,
  itemName = 'data',
  className = '',
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const [jumpInput, setJumpInput] = useState(String(currentPage));

  useEffect(() => {
    setJumpInput(String(currentPage));
  }, [currentPage]);

  const startRecord = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalItems);

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseInt(jumpInput, 10);
    if (!isNaN(target) && target >= 1 && target <= totalPages) {
      onPageChange(target);
    } else {
      setJumpInput(String(currentPage));
    }
  };

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <div
      className={`bg-slate-50 px-4 py-3 border-t border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs ${className}`}
    >
      {/* Left: Record Range Info & Page Size Selector */}
      <div className="flex flex-wrap items-center gap-3 text-slate-600">
        <div>
          Menampilkan{' '}
          <span className="font-bold text-slate-900">{startRecord.toLocaleString('id-ID')}</span> -{' '}
          <span className="font-bold text-slate-900">{endRecord.toLocaleString('id-ID')}</span> dari{' '}
          <span className="font-bold text-indigo-700">{totalItems.toLocaleString('id-ID')}</span> {itemName}
          {totalItems > 0 && (
            <span className="text-slate-400 ml-1.5 font-medium">
              (Hal. {currentPage} dari {totalPages})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-300">
          <span className="text-[11px] text-slate-500 whitespace-nowrap">Tampilkan:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const newSize = Number(e.target.value);
              onPageSizeChange(newSize);
              onPageChange(1);
            }}
            className="px-2 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt} / hal
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: Pagination Controls */}
      <div className="flex flex-wrap items-center gap-1.5 self-center lg:self-auto">
        {/* First Page */}
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
          title="Halaman Pertama"
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none text-slate-600 transition shadow-2xs cursor-pointer"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          title="Halaman Sebelumnya"
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none text-slate-700 font-medium transition flex items-center gap-1 shadow-2xs cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Sebelumnya</span>
        </button>

        {/* Page Number Buttons */}
        <div className="flex items-center gap-1 px-1">
          {getPageNumbers().map((p, idx) => {
            if (typeof p === 'string') {
              return (
                <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 font-bold">
                  ...
                </span>
              );
            }
            const isActive = p === currentPage;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`min-w-7 h-7 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          title="Halaman Berikutnya"
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none text-slate-700 font-medium transition flex items-center gap-1 shadow-2xs cursor-pointer"
        >
          <span className="hidden sm:inline">Berikutnya</span>
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Last Page */}
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          title="Halaman Terakhir"
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none text-slate-600 transition shadow-2xs cursor-pointer"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>

        {/* Jump to Page */}
        {totalPages > 2 && (
          <form onSubmit={handleJumpSubmit} className="hidden sm:flex items-center gap-1 ml-2 text-xs">
            <span className="text-slate-400">Ke:</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              className="w-12 px-1.5 py-1 text-center font-bold text-slate-800 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </form>
        )}
      </div>
    </div>
  );
};
