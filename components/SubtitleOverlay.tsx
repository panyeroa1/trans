
import React from 'react';

interface SubtitleOverlayProps {
  text: string;
}

const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ text }) => {
  if (!text) return null;

  return (
    <div className="fixed bottom-12 left-0 right-0 flex justify-center items-center pointer-events-none px-10">
      <div className="bg-black/60 backdrop-blur-sm px-6 py-3 rounded-lg border border-white/5 max-w-4xl text-center">
        <p className="font-helvetica-thin text-[16px] text-[#32CD32] leading-relaxed tracking-wide drop-shadow-md">
          {text}
        </p>
      </div>
    </div>
  );
};

export default SubtitleOverlay;
