{pkgs}: {
  deps = [
    pkgs.ffmpeg
    pkgs.libuuid
    pkgs.python3
    pkgs.pixman
    pkgs.librsvg
    pkgs.giflib
    pkgs.libjpeg
    pkgs.libpng
    pkgs.pango
    pkgs.cairo
    pkgs.pkg-config
    pkgs.postgresql
  ];
}
