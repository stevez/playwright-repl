export function SunIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" fill="none" strokeWidth="2">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function MoonIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" fill="none" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function FolderOpenIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" fill="none" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function SaveIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" fill="none" strokeWidth="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

export function RecordIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" fill="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

export function StopIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" fill="currentColor" strokeWidth="2">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}

export function BugIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="15" rx="4" ry="5" />
      <circle cx="12" cy="7.5" r="2.5" />
      <line x1="10.5" y1="5.5" x2="8" y2="3" />
      <line x1="13.5" y1="5.5" x2="16" y2="3" />
      <line x1="8" y1="13" x2="4" y2="12" />
      <line x1="8" y1="15" x2="4" y2="15" />
      <line x1="8" y1="17" x2="4" y2="18" />
      <line x1="16" y1="13" x2="20" y2="12" />
      <line x1="16" y1="15" x2="20" y2="15" />
      <line x1="16" y1="17" x2="20" y2="18" />
      <line x1="12" y1="10" x2="12" y2="20" />
    </svg>
  );
}

export function StepForwardIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="15" y2="12" />
      <polyline points="11 8 15 12 11 16" />
      <line x1="19" y1="7" x2="19" y2="17" />
    </svg>
  );
}

export function AbortIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}

export function CrosshairIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 4C1 2.89543 1.89543 2 3 2H13C14.1046 2 15 2.89543 15 4L15 10C15 10.8062 14.523 11.501 13.8358 11.8175C13.7656 11.6802 13.6736 11.5523 13.5607 11.4394L13.1148 10.9935C13.613 10.9366 14 10.5135 14 10L14 4C14 3.44772 13.5523 3 13 3H3C2.44772 3 2 3.44772 2 4L2 10C2 10.5523 2.44772 11 3 11H7V12H3C1.89543 12 1 11.1046 1 10L1 4ZM8.85356 8.14645C8.71056 8.00345 8.4955 7.96067 8.30866 8.03806C8.12182 8.11545 8 8.29777 8 8.5V14.5C8 14.7152 8.13772 14.9063 8.34189 14.9743C8.54606 15.0424 8.77087 14.9722 8.9 14.8L10.25 13H12.5C12.7022 13 12.8846 12.8782 12.9619 12.6913C13.0393 12.5045 12.9966 12.2894 12.8536 12.1464L8.85356 8.14645ZM9 13V9.70711L11.2929 12H10C9.84262 12 9.69443 12.0741 9.6 12.2L9 13Z" />
    </svg>
  );
}

export function TabsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="4" width="14" height="10" rx="1.5"/>
      <path d="M1 7h14"/>
      <rect x="3" y="1" width="6" height="4" rx="1"/>
    </svg>
  );
}