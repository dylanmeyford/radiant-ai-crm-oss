import React, { useState } from 'react';
import { MoreHorizontal, Edit3, Trash2 } from 'lucide-react';
import { PipelineStage } from '@/types/pipeline';
import { StageEditDropdown } from './StageEditDropdown';

interface StageMenuProps {
  stage: PipelineStage;
  onDelete: () => void;
  pipelineId?: string;
}

export const StageMenu: React.FC<StageMenuProps> = ({
  stage,
  onDelete,
  pipelineId,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const isProtectedStage = stage.isClosedWon || stage.isClosedLost;

  return (
    <div className="relative">
      <button 
        className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100"
        onClick={(e) => {
          e.stopPropagation();
          if (isEditOpen) {
            setIsEditOpen(false);
          } else {
            setIsMenuOpen(!isMenuOpen);
          }
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {(isMenuOpen || isEditOpen) && (
        <>
          {/* Backdrop to close on outside click */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => {
              setIsMenuOpen(false);
              setIsEditOpen(false);
            }}
          />
          
          {isMenuOpen && (
            /* Dropdown menu */
            <div className="absolute top-full right-0 mt-1 w-48 bg-white rounded-lg border border-gray-200 shadow-lg z-50 py-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                  setIsEditOpen(true);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center cursor-pointer"
              >
                <Edit3 className="mr-2 h-4 w-4" />
                <span>Edit</span>
              </button>
              
              {!isProtectedStage && (
                <>
                  <div className="border-t border-gray-200 my-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(false);
                      onDelete();
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 flex items-center cursor-pointer text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Delete stage</span>
                  </button>
                </>
              )}
            </div>
          )}

          {isEditOpen && (
            /* Edit form dropdown */
            <StageEditDropdown
              stage={stage}
              onClose={() => {
                setIsEditOpen(false);
                setIsMenuOpen(false);
              }}
              pipelineId={pipelineId}
            />
          )}
        </>
      )}
    </div>
  );
};

