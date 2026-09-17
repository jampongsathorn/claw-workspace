# Platform Notes — Linux

- Shell: bash or zsh (see the environment block); POSIX command dialect.
- Case-sensitive filesystem.
- Sandbox (as reported in the environment block): Docker container, or bwrap + Landlock (+ seccomp). A sandbox denial means wider permission is needed — say so and ask.
- Use the scratchpad directory for temporary files.
