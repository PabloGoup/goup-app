import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

export default function LoadingButton({
  loading = false,
  children,
  className = "",
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`px-4 py-2 rounded-md bg-[#FE8B02] hover:bg-[#7a23d9] disabled:opacity-50 transition-colors ${className}`}
    >
      {loading ? "Cargando..." : children}
    </button>
  );
}