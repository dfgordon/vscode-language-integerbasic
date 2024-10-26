# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### New Features

* Language server is native rust code
* Optionally accepts immediate mode commands
* Disk image support is bundled, no need for external `a2kit` installation
* User control of diagnostic severity

### Breaking Changes

* Goto references will not overlap with goto definitions or declarations.  Examples:
    - `DIM A$(10)` is only found as a declaration
    - `INPUT A$` is only found as a definition
    - `PRINT A$` is only found as a reference
* Some options have changed from boolean to an enumerated severity level
* Platform support works differently
    - Out of the box support for Linux-x64, Mac-x64, Mac-aarch64, and Windows-x64, everything needed is bundled.
    - Universal version requires an external `a2kit` installation, not only for disk images, but for all services.
