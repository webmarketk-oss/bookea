import Link from "next/link";

type BookeaLogoProps = {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  showSlogan?: boolean;
  href?: string;
};

const sizeClasses = {
  sm: { icon: "h-8 w-8", letter: "text-lg", text: "text-base", slogan: "text-[10px]" },
  md: { icon: "h-10 w-10", letter: "text-xl", text: "text-xl", slogan: "text-xs" },
  lg: { icon: "h-12 w-12", letter: "text-2xl", text: "text-3xl", slogan: "text-sm" },
};

export function BookeaLogo({
  size = "md",
  showText = true,
  showSlogan = false,
  href,
}: BookeaLogoProps) {
  const classes = sizeClasses[size];

  const content = (
    <>
      <div className={`relative ${classes.icon} shrink-0`}>
        <svg
          viewBox="0 0 128 128"
          className="h-full w-full drop-shadow-[0_14px_24px_rgba(79,70,229,0.28)]"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id="bookeaMarkGradient"
              x1="18"
              y1="112"
              x2="108"
              y2="14"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#6D28D9" />
              <stop offset="0.48" stopColor="#4F46E5" />
              <stop offset="1" stopColor="#22C7E8" />
            </linearGradient>
            <linearGradient
              id="bookeaRibbonGradient"
              x1="18"
              y1="104"
              x2="94"
              y2="58"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#55C7F3" />
              <stop offset="0.5" stopColor="#3988F2" />
              <stop offset="1" stopColor="#7C3AED" />
            </linearGradient>
            <radialGradient
              id="bookeaMarkGlow"
              cx="0"
              cy="0"
              r="1"
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(34 20) rotate(55) scale(76)"
            >
              <stop stopColor="white" stopOpacity="0.45" />
              <stop offset="1" stopColor="white" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            d="M31 116V12h45c24 0 40 14 40 36 0 12-6 22-16 28 13 6 21 17 21 33 0 4-3 7-7 7H31Z"
            fill="url(#bookeaMarkGradient)"
          />
          <path
            d="M31 116V12h45c24 0 40 14 40 36 0 12-6 22-16 28 13 6 21 17 21 33 0 4-3 7-7 7H31Z"
            fill="url(#bookeaMarkGlow)"
          />
          <path
            d="M55 34h19c10 0 17 6 17 16s-7 16-17 16H55V34Z"
            fill="white"
            opacity="0.96"
          />
          <path
            d="M55 78h24c11 0 19 7 19 17s-8 18-20 18H55V78Z"
            fill="white"
            opacity="0.96"
          />
          <path
            d="M31 109L94 70C102 65 113 70 116 80L57 116H31Z"
            fill="url(#bookeaRibbonGradient)"
          />
        </svg>
      </div>

      {showText && (
        <span className="flex flex-col leading-none">
          <span
            className={`${classes.text} bg-gradient-to-r from-violet-600 via-blue-500 to-cyan-400 bg-clip-text font-black tracking-tight text-transparent`}
          >
            Bookea
          </span>
          {showSlogan && (
            <span
              className={`${classes.slogan} mt-1 font-medium leading-tight text-slate-500`}
            >
              Le planning qui remplit votre agenda ✦
            </span>
          )}
        </span>
      )}
    </>
  );

  const wrapperClass = "flex items-center gap-3";

  if (href) {
    return (
      <Link href={href} className={wrapperClass}>
        {content}
      </Link>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}
