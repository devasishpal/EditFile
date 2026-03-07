import { useState } from 'react';
import ToolTemplate from './ToolTemplate';
import { Eye, EyeOff } from 'lucide-react';

export default function ProtectPDF() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState({
    printing: true,
    copying: false,
    editing: false,
  });

  const settingsComponent = (
    <div className="space-y-4">
      <div>
        <label className="font-display font-bold text-dark block mb-2">
          Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
          />
          <button
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray hover:text-violet"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div>
        <label className="font-display font-bold text-dark block mb-2">
          Confirm Password
        </label>
        <input
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm password"
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet focus:outline-none"
        />
      </div>

      {password && confirmPassword && password !== confirmPassword && (
        <p className="text-red-500 text-sm">Passwords do not match</p>
      )}

      <div>
        <label className="font-display font-bold text-dark block mb-3">
          Permissions
        </label>
        <div className="space-y-2">
          {[
            { key: 'printing', label: 'Allow printing' },
            { key: 'copying', label: 'Allow copying text/images' },
            { key: 'editing', label: 'Allow editing' },
          ].map((perm) => (
            <label
              key={perm.key}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors"
            >
              <input
                type="checkbox"
                checked={permissions[perm.key as keyof typeof permissions]}
                onChange={(e) =>
                  setPermissions((prev) => ({
                    ...prev,
                    [perm.key]: e.target.checked,
                  }))
                }
                className="w-5 h-5 accent-violet"
              />
              <span className="text-dark">{perm.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <ToolTemplate
      acceptedFileTypes=".pdf"
      fileTypeLabel="PDF"
      showSettings={true}
      settingsComponent={settingsComponent}
    />
  );
}
