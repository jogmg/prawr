import logoII from "@/public/assets/prawr_logo.svg";
import Image from "next/image";
import Link from "next/link";

export function Logo() {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-3"
      aria-label="Prawr home"
    >
      <div className="relative aspect-square w-10">
        <Image src={logoII} alt="Prawr logo" className="object-cover" fill />
      </div>
    </Link>
  );
}
