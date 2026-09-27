/** Playwright's installed Chromium on Linux; preserve the local Mac renderer. */
export function browserLaunch(platform: string, executablePath: string | undefined) {
  return {
    executablePath: executablePath ?? (platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
    headless: true,
    args: platform === 'darwin'
      ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  };
}
