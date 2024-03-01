## [0.13.2](https://github.com/obviyus/HamVerBot/compare/v0.13.1...v0.13.2) (2024-03-01)


### Bug Fixes

* **alert:** check for > 0 ([e4452e7](https://github.com/obviyus/HamVerBot/commit/e4452e71a45bec467a1ce463a4ea9f151a7e1157))

## [0.13.1](https://github.com/obviyus/HamVerBot/compare/v0.13.0...v0.13.1) (2024-02-29)


### Bug Fixes

* **cron:** make cron run every 5 minutes ([29ad9a7](https://github.com/obviyus/HamVerBot/commit/29ad9a791334f956cabbc0454bf8ac11ebfc6373))

# [0.13.0](https://github.com/obviyus/HamVerBot/compare/v0.12.1...v0.13.0) (2024-02-26)


### Features

* **irc:** support password via env ([8bffb49](https://github.com/obviyus/HamVerBot/commit/8bffb49663268a3be90020cdd39f7bbd5aa5dd7d))

## [0.12.1](https://github.com/obviyus/HamVerBot/compare/v0.12.0...v0.12.1) (2024-02-25)


### Bug Fixes

* **sqlite:** create DB if missing ([a2913a1](https://github.com/obviyus/HamVerBot/commit/a2913a1c1b504d0f113b5b46a64f438d5b9d91d2))

# [0.12.0](https://github.com/obviyus/HamVerBot/compare/v0.11.1...v0.12.0) (2024-02-13)


### Features

* **countdown:** fallback to DB if no event within 5 minutes ([c4492af](https://github.com/obviyus/HamVerBot/commit/c4492af590dd4b732360cd7a60f8514ba09eca39))

## [0.11.1](https://github.com/obviyus/HamVerBot/compare/v0.11.0...v0.11.1) (2024-01-14)


### Bug Fixes

* **results:** exclude livery event in fetcher ([ee6bebe](https://github.com/obviyus/HamVerBot/commit/ee6bebe22b62ca0dae20cec58375a4ee18e90c70))

# [0.11.0](https://github.com/obviyus/HamVerBot/compare/v0.10.0...v0.11.0) (2024-01-14)


### Bug Fixes

* **calendar:** refresh for previous year for results ([35e191c](https://github.com/obviyus/HamVerBot/commit/35e191c5e8581de2d1c3490e8e588efa73a7df69))


### Features

* **api:** update API spec ([513e83d](https://github.com/obviyus/HamVerBot/commit/513e83d0a2e57d0e3bad4f02a8e5a69865bcdcd8))
* **event_type:** additional outputs ([4448221](https://github.com/obviyus/HamVerBot/commit/4448221eee7478c776000ed51101510837174835))
* **irc:** helper function for auth ([7c343d4](https://github.com/obviyus/HamVerBot/commit/7c343d44a44a1364a7e39843b95f9227f857ed47))
* **models:** update models for F1Calendar API ([787d9af](https://github.com/obviyus/HamVerBot/commit/787d9afe34b294160622025d6bc99b3408bdc142))
* **py:** remove py implementation ([946c7cc](https://github.com/obviyus/HamVerBot/commit/946c7cc501f53366534b31a08e790f10eedca0e5))
* **sql:** additional tables for new API ([fbe8de8](https://github.com/obviyus/HamVerBot/commit/fbe8de8fce025feb79137ceed3828e66b07cff54))
* **sqlx:** bump sqlx ([41d3ca4](https://github.com/obviyus/HamVerBot/commit/41d3ca46d3528571f4b0cd646ea456032d55c646))
* **worker:** simplify job logic ([1a8a72f](https://github.com/obviyus/HamVerBot/commit/1a8a72fdc314d4256fff10464a2891a81be35a81))

# [0.10.0](https://github.com/obviyus/HamVerBot/compare/v0.9.1...v0.10.0) (2023-06-09)


### Bug Fixes

* **clean:** remove deprecated files ([ceb7278](https://github.com/obviyus/HamVerBot/commit/ceb72787958c4f3795092c2b844bcfcc03893fa9))
* **clippy:** apply clippy lints ([626d358](https://github.com/obviyus/HamVerBot/commit/626d358441a3fb7c924478c14983e3b431c95198))
* **prev:** fix duplicate SQL calls ([aaf624a](https://github.com/obviyus/HamVerBot/commit/aaf624a8a750c21d585f53cf56591f63940a5b37))
* **result:** set result for closest event ([9db39be](https://github.com/obviyus/HamVerBot/commit/9db39be0034178d356365310900d4c3a85768c74))
* **worker:** run workers in another thread ([9d798e8](https://github.com/obviyus/HamVerBot/commit/9d798e856246e9dacf7252fbedba614d38375489))
* **wxc:** store only one instance of standings ([7ecb7c1](https://github.com/obviyus/HamVerBot/commit/7ecb7c122c5e4aa87d7d36ab2fa457a52eaa6b78))


### Features

* **command:** allow parameterized when command ([c2a9500](https://github.com/obviyus/HamVerBot/commit/c2a95000ff56705894c67bef5f3644a7049940d5))
* **db:** run migrations at startup ([4658f67](https://github.com/obviyus/HamVerBot/commit/4658f6720de7b3d5104c52226add526e405a67b7))
* **env:** default env file ([3a6c2d7](https://github.com/obviyus/HamVerBot/commit/3a6c2d798024fde19f34900fc1bef1fd0d6a0a53))
* **sql:** create migrations ([38b17ce](https://github.com/obviyus/HamVerBot/commit/38b17ce524ed255b95426be6186afeac6f49630e))
* **v2:** re-write with improved deps and logic ([31de7e2](https://github.com/obviyus/HamVerBot/commit/31de7e2778ca5a8483953a58ee5cdd767c1ea265))
* **wxc:** fetch standings every 5 minutes ([f53ed4f](https://github.com/obviyus/HamVerBot/commit/f53ed4fc17d4687efccc02d87d99faa0174b59c1))

## [0.9.1](https://github.com/obviyus/HamVerBot/compare/v0.9.0...v0.9.1) (2023-05-16)


### Bug Fixes

* **event:** remove extra emoji ([7b49ff4](https://github.com/obviyus/HamVerBot/commit/7b49ff43ce0eda2e66efc2bd50803f1dc32fb164))

# [0.9.0](https://github.com/obviyus/HamVerBot/compare/v0.8.0...v0.9.0) (2023-03-18)


### Features

* **next:** filter next by event type ([880a661](https://github.com/obviyus/HamVerBot/commit/880a66141f2dcee425b196b7f9aa699244a1277f))

# [0.8.0](https://github.com/obviyus/HamVerBot/compare/v0.7.0...v0.8.0) (2023-03-07)


### Features

* **config:** add fly.io configs ([6e44278](https://github.com/obviyus/HamVerBot/commit/6e442786f290e56a673b626727968aa4d4c81737))

# [0.7.0](https://github.com/obviyus/HamVerBot/compare/v0.6.1...v0.7.0) (2023-03-04)


### Bug Fixes

* **cargo:** remove dependency on openssl ([a46dbb3](https://github.com/obviyus/HamVerBot/commit/a46dbb35d0f1a4db8bb6411829c69946404fa542))


### Features

* **docker:** create Dockerfile to deploy to fly.io ([0412c53](https://github.com/obviyus/HamVerBot/commit/0412c53207961e4d008ed4630620a7cf9801b9cd))

## [0.6.1](https://github.com/obviyus/HamVerBot/compare/v0.6.0...v0.6.1) (2022-12-13)


### Bug Fixes

* **clippy:** apply lint fixes ([56652d7](https://github.com/obviyus/HamVerBot/commit/56652d71205fdaa6a69d57de0b2371ae3684e84b))

# [0.6.0](https://github.com/obviyus/HamVerBot/compare/v0.5.0...v0.6.0) (2022-12-13)


### Features

* **dummy:** dummy commit to test CI ([168802d](https://github.com/obviyus/HamVerBot/commit/168802d45a5b0c1cebc302d6e1d4484143ca5f49))

# [0.5.0](https://github.com/obviyus/HamVerBot/compare/v0.4.0...v0.5.0) (2022-11-20)


### Features

* **prev:** create new command for previous results ([08bf857](https://github.com/obviyus/HamVerBot/commit/08bf8579c6213cfad52c56f653384da2463e6033))

# [0.4.0](https://github.com/obviyus/HamVerBot/compare/v0.3.1...v0.4.0) (2022-10-22)


### Features

* **d|c:** create new commands for standings ([9091a58](https://github.com/obviyus/HamVerBot/commit/9091a5837b5a91f4b9797bb2a67a71927530ca59))
