import { Link } from 'react-router-dom';
import { Clock3, Wrench } from 'lucide-react';

interface ComingSoonToolProps {
  title: string;
  message: string;
  suggestedToolHref?: string;
  suggestedToolLabel?: string;
}

export default function ComingSoonTool({
  title,
  message,
  suggestedToolHref,
  suggestedToolLabel,
}: ComingSoonToolProps) {
  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-8 overflow-x-clip">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="sticker-card p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-violet/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Wrench className="w-6 h-6 text-violet" />
            </div>
            <div>
              <h3 className="font-display font-bold text-xl text-dark">{title}</h3>
              <p className="text-gray mt-2">{message}</p>
            </div>
          </div>
        </div>

        <div className="sticker-card p-5">
          <div className="flex items-start gap-3 text-gray">
            <Clock3 className="w-5 h-5 text-violet mt-0.5 flex-shrink-0" />
            <p className="text-sm">
              This tool is now listed and routed in your project. Processing integration is the
              next step.
            </p>
          </div>
          {suggestedToolHref && suggestedToolLabel && (
            <div className="mt-4">
              <Link to={suggestedToolHref} className="sticker-button-secondary">
                Open {suggestedToolLabel}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
