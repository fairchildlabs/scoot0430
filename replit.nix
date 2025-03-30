{pkgs}: {
  deps = [
    pkgs.socat
    pkgs.lsof
    pkgs.nano
    pkgs.pkg-config
    pkgs.jq
    pkgs.postgresql
  ];
}
