import logo from "@/public/assets/prawr_logo_complete.svg";
import Image from "next/image";
import Link from "next/link";

export function Logo() {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-3"
      aria-label="Prawr home"
    >
      <div className="relative aspect-[12/7] w-16">
        <Image src={logo} alt="Prawr logo" className="object-cover" fill />
      </div>
    </Link>
  );
}
