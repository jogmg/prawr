export function shortenWalletAddress(address: string): string {
  const visiblePrefixLength = 6;
  const visibleSuffixLength = 4;
  const minimumLengthToShorten =
    visiblePrefixLength + visibleSuffixLength + 3;

  if (address.length <= minimumLengthToShorten) return address;

  return `${address.slice(0, visiblePrefixLength)}...${address.slice(
    -visibleSuffixLength
  )}`;
}