import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Plus, X } from "lucide-react";
import { useLocation } from "wouter";
import { isMobileDevice } from "@/lib/pwa";

export function MobileFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();

  if (!isMobileDevice()) {
    return null;
  }

  const actions = [
    {
      icon: <Camera className="w-6 h-6" />,
      label: "Camera Analysis",
      action: () => {
        setLocation("/analysis");
        setIsOpen(false);
      },
      testId: "fab-camera"
    },
    {
      icon: <Upload className="w-6 h-6" />,
      label: "Upload Chart",
      action: () => {
        setLocation("/analysis");
        setIsOpen(false);
      },
      testId: "fab-upload"
    },
  ];

  return (
    <div className="fixed bottom-20 right-6 z-40" data-testid="mobile-fab-container">
      {isOpen && (
        <div className="absolute bottom-16 right-0 flex flex-col gap-3 mb-2">
          {actions.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <span className="bg-background border px-3 py-1 rounded-full text-sm font-medium shadow-lg whitespace-nowrap">
                {item.label}
              </span>
              <Button
                onClick={item.action}
                size="icon"
                className="h-12 w-12 rounded-full shadow-lg"
                data-testid={item.testId}
              >
                {item.icon}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="icon"
        className="h-14 w-14 rounded-full shadow-2xl"
        data-testid="fab-main-button"
      >
        {isOpen ? (
          <X className="w-7 h-7" />
        ) : (
          <Plus className="w-7 h-7" />
        )}
      </Button>
    </div>
  );
}
