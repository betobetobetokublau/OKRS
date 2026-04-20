/**
 * Auth layout: passthrough. Each auth page owns its own background +
 * centering (login is full-bleed split-screen; cambiar-password is a
 * centered card). Putting centering in the layout would fight the
 * split-screen login.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
