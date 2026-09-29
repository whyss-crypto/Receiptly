import type { SVGProps } from 'react';

function Base({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconHome() {
  return (
    <Base>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v10h12V10" />
    </Base>
  );
}

export function IconScan() {
  return (
    <Base>
      <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
      <path d="M4 12h16" />
    </Base>
  );
}

export function IconStack() {
  return (
    <Base>
      <path d="M4 7l8-4 8 4-8 4-8-4Z" />
      <path d="M4 12l8 4 8-4M4 17l8 4 8-4" />
    </Base>
  );
}

export function IconSliders() {
  return (
    <Base>
      <path d="M5 7h14M5 12h14M5 17h14" />
      <path d="M10 4v6M15 9v6M9 14v6" />
    </Base>
  );
}

export function IconPlus() {
  return (
    <Base>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function IconSun() {
  return (
    <Base>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2 2M17.5 17.5l2 2M19.5 4.5l-2 2M6.5 17.5l-2 2" />
    </Base>
  );
}

export function IconMoon() {
  return (
    <Base>
      <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
    </Base>
  );
}

export function IconMenu() {
  return (
    <Base>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  );
}

export function IconX() {
  return (
    <Base>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  );
}

export function IconArrowR() {
  return (
    <Base>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </Base>
  );
}

export function IconArrowL() {
  return (
    <Base>
      <path d="M20 12H5M11 6l-6 6 6 6" />
    </Base>
  );
}

export function IconTrash() {
  return (
    <Base>
      <path d="M5 7h14M10 5h4M8 7l1 13h6l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Base>
  );
}

export function IconUpload() {
  return (
    <Base>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </Base>
  );
}

export function IconCamera() {
  return (
    <Base>
      <path d="M8 7l1.5-3h5L16 7" />
      <rect x="3" y="7" width="18" height="13" rx="1" />
      <circle cx="12" cy="13.5" r="3.5" />
    </Base>
  );
}

export function IconCheck() {
  return (
    <Base>
      <path d="M4 12.5 10 18 20 6" />
    </Base>
  );
}

export function IconQuestion() {
  return (
    <Base>
      <path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1-1.5 2.4" />
      <path d="M12 17.5v.5" />
    </Base>
  );
}

export function IconSplit() {
  return (
    <Base>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16.2 14.7c2.7.4 4.8 2.7 4.8 5.3" />
    </Base>
  );
}
