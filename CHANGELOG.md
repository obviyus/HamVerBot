# 1.0.0 (2025-03-04)


### Bug Fixes

* **alert:** check for > 0 ([e9657d6](https://github.com/obviyus/HamVerBot/commit/e9657d64e1960e4be90357dd9a09b723723b5a06))
* **alert:** use leq for comparing time ([d1ee818](https://github.com/obviyus/HamVerBot/commit/d1ee8181c971f74f0a5a96ce1fe67690c2352910))
* **calendar:** refresh for previous year for results ([52da176](https://github.com/obviyus/HamVerBot/commit/52da176b64c7617f8b14d452f5d444f549587ffe))
* **cargo:** include `cargo.lock` for builds ([3d74248](https://github.com/obviyus/HamVerBot/commit/3d74248ee76b6eedbdaa82bccc9d5f83a314b41e))
* **cargo:** remove dependency on openssl ([e427dbd](https://github.com/obviyus/HamVerBot/commit/e427dbd94a034ad6eaf742e6161b4e69b33f7176))
* **ci:** remove `semantic-release` from `Cargo.toml` ([367d4cf](https://github.com/obviyus/HamVerBot/commit/367d4cf79ef6460352a481f73b84e1ad92afddc5))
* **clean:** remove deprecated files ([56d57aa](https://github.com/obviyus/HamVerBot/commit/56d57aa5e31856af15f177dfbc1c8204978c767f))
* **clippy:** apply clippy lints ([24fb03c](https://github.com/obviyus/HamVerBot/commit/24fb03ced902ae24fed745042bf0e2841b3fe3dd))
* **clippy:** apply lint fixes ([cd9f4dd](https://github.com/obviyus/HamVerBot/commit/cd9f4ddcc08320ff327ae59881b85a543c349110))
* **command:** trim end of commands ([100e473](https://github.com/obviyus/HamVerBot/commit/100e47354a18bcdd0f47a4b1583d965d6e308c6f))
* **cron:** make cron run every 5 minutes ([d8a1ce4](https://github.com/obviyus/HamVerBot/commit/d8a1ce4a2a45e20e0d7e48954182891d64e88e4c))
* **db:** support Sprint Qualifying event ([dc0f51b](https://github.com/obviyus/HamVerBot/commit/dc0f51ba284361f37ead56c89ab13367fbe13cf7))
* **docs:** fix status badge ([d8f768e](https://github.com/obviyus/HamVerBot/commit/d8f768e43677571661834ffd05c108566930a12b))
* **driver:** handle missing data in driver list ([5b570d9](https://github.com/obviyus/HamVerBot/commit/5b570d9016bd464c8f770507d775c170eaf505c8))
* **eta:** hardcode 5 minute time ([bbf0724](https://github.com/obviyus/HamVerBot/commit/bbf072410fe9c9558f79e7f268be1dd04632072c))
* **event:** remove extra emoji ([68b9476](https://github.com/obviyus/HamVerBot/commit/68b947677c68506b4c25b290761afeade53c4dfb))
* **prev:** fix duplicate SQL calls ([5361cc7](https://github.com/obviyus/HamVerBot/commit/5361cc77c761ad9fac461d0d5756c50af5a9f74b))
* remove sqlx cache and migrations ([a0595ed](https://github.com/obviyus/HamVerBot/commit/a0595ed8007639901f511aff3f63f5ea90ad09e0))
* **result:** handle unmatched driver keys ([21b32c3](https://github.com/obviyus/HamVerBot/commit/21b32c3c4f399b621f5e4fbe4565c91cc2a96f9d))
* **result:** set result for closest event ([e5ea84d](https://github.com/obviyus/HamVerBot/commit/e5ea84d0eb17cdf7c5dd316cc62ff3ecc66db84e))
* **results:** exclude livery event in fetcher ([0b7df36](https://github.com/obviyus/HamVerBot/commit/0b7df360269388cb9a2ad9bf45cd814a60a86fea))
* **results:** include meeting name in results ([740ff2e](https://github.com/obviyus/HamVerBot/commit/740ff2e167e0d89e82a6051cbec76f1883fb6708))
* **sqlite:** create DB if missing ([d7ad57e](https://github.com/obviyus/HamVerBot/commit/d7ad57e1825769828880f11f81402da4f560aef9))
* **sqlx:** re-add cached query ([b451075](https://github.com/obviyus/HamVerBot/commit/b451075800ba7392c5dd53d4e787cb54f09416aa))
* **store:** store path after delivery ([3ef13ab](https://github.com/obviyus/HamVerBot/commit/3ef13ab9d46457795e67ee30bf7afe0be7681173))
* **string:** use % to calculate remaining minutes ([2f4a2ea](https://github.com/obviyus/HamVerBot/commit/2f4a2ea4cc5d84c8c9bee34e214f8d76cbf98455))
* **worker:** remove unn-necessary deref ([c51fa39](https://github.com/obviyus/HamVerBot/commit/c51fa39c08b65f0ea9bd60cf6f9cf04784b00d1d))
* **worker:** run workers in another thread ([c09be88](https://github.com/obviyus/HamVerBot/commit/c09be88e514ac68aec8c54d753241890c02e8b1d))
* **wxc:** store only one instance of standings ([277b6de](https://github.com/obviyus/HamVerBot/commit/277b6dec5475502c487a9e895f36f601c690c239))


### Features

* **api:** update API spec ([c27545e](https://github.com/obviyus/HamVerBot/commit/c27545ef3354042d6cbbe2e9c03cd360e1a08dd3))
* **command:** allow parameterized when command ([5df7ee0](https://github.com/obviyus/HamVerBot/commit/5df7ee0ec977604b8cc5adbed2c2bc9e6ec4f8e0))
* **config:** add fly.io configs ([bff7e5f](https://github.com/obviyus/HamVerBot/commit/bff7e5ff27a5e767e3a9614b8460f89f7cfd7efd))
* **countdown:** fallback to DB if no event within 5 minutes ([212cd9e](https://github.com/obviyus/HamVerBot/commit/212cd9eb6944ee6732ea6dcf9c03d7089877feb9))
* **d|c:** create new commands for standings ([54e0091](https://github.com/obviyus/HamVerBot/commit/54e00916119e96b2b830e06efe344d08bb7dbcaa))
* **db:** run migrations at startup ([65ba5b1](https://github.com/obviyus/HamVerBot/commit/65ba5b114bbd44d6bd89e35b1d04c6006429cbb6))
* **db:** support sq ([d48bc5a](https://github.com/obviyus/HamVerBot/commit/d48bc5a1b3d37c1c057aed52bc74169c6bf468b0))
* **docker:** create Dockerfile to deploy to fly.io ([a38a619](https://github.com/obviyus/HamVerBot/commit/a38a619cda8f07593b09941a7169537b1c4e82c2))
* **event_type:** additional outputs ([f8c699d](https://github.com/obviyus/HamVerBot/commit/f8c699dc0d31168a4916b845ccb133bac24e1d07))
* init ts version ([2191f41](https://github.com/obviyus/HamVerBot/commit/2191f41f6b7adcab587917bdede55205424b75b2))
* **irc:** helper function for auth ([e87d79a](https://github.com/obviyus/HamVerBot/commit/e87d79ac336406ec6a4fcf1d4dfb2439fe81858b))
* **irc:** support password via env ([f77b67d](https://github.com/obviyus/HamVerBot/commit/f77b67d7f182456ca1bb058fa41ee5d6b28cb219))
* **logo:** HamVerBot logo ([23eed6c](https://github.com/obviyus/HamVerBot/commit/23eed6c6732840c4012c232391929fa46e33d4ac))
* **models:** update models for F1Calendar API ([5f9934a](https://github.com/obviyus/HamVerBot/commit/5f9934a9f13d96b1fce0486d2462178cda497491))
* **next:** filter next by event type ([9c65ec1](https://github.com/obviyus/HamVerBot/commit/9c65ec11bbb813d4af2b7432c896864788bb9d46))
* **prev:** create new command for previous results ([f7fb728](https://github.com/obviyus/HamVerBot/commit/f7fb728d8c19debc0cc87a3de76ad57b26fba05f))
* **py:** remove py implementation ([b8d904d](https://github.com/obviyus/HamVerBot/commit/b8d904da9106646ee35006ade13520f5f0ed9054))
* remove Rust code ([8444134](https://github.com/obviyus/HamVerBot/commit/844413479bcb16a20d621e15ab02182ed92987ea))
* **rewrite:** make bot async and improve structure ([fc13eb9](https://github.com/obviyus/HamVerBot/commit/fc13eb9e712b1a0b98bb01ed2b7e9a56cc541b05))
* **sql:** additional tables for new API ([d899225](https://github.com/obviyus/HamVerBot/commit/d89922514a346ea96f1ad8ecbc1a682844ee8252))
* **sql:** create migrations ([821078a](https://github.com/obviyus/HamVerBot/commit/821078a5ee1d772732e46b352c03c677bf881957))
* **sqlx:** bump sqlx ([e136824](https://github.com/obviyus/HamVerBot/commit/e136824116a89650df65f993a9cdcb9cf36e1763))
* **string:** add number of hours to days left string ([9cbe626](https://github.com/obviyus/HamVerBot/commit/9cbe626216e0cbcab86bd6d17093a4aad13f0376))
* support specifying TZ in commands ([515db07](https://github.com/obviyus/HamVerBot/commit/515db073a3134a71e1305eb9dd146b6d8f78f332))
* update .ignore files ([324e444](https://github.com/obviyus/HamVerBot/commit/324e444c740fb300c28d3ee2dde8f05ec595b570))
* **v2:** re-write with improved deps and logic ([49f1b82](https://github.com/obviyus/HamVerBot/commit/49f1b829fa576e653a902cd5793d0b612ad25035))
* **worker:** simplify job logic ([ac1c669](https://github.com/obviyus/HamVerBot/commit/ac1c6691df69b328167bf0fc2688b54bdf8496de))
* **wxc:** fetch standings every 5 minutes ([5840b2a](https://github.com/obviyus/HamVerBot/commit/5840b2a63f79a242e73fab38127b5d01cdb83848))

## [0.14.2](https://github.com/obviyus/HamVerBot/compare/v0.14.1...v0.14.2) (2024-07-20)


### Bug Fixes

* **result:** handle unmatched driver keys ([089d8b2](https://github.com/obviyus/HamVerBot/commit/089d8b2b6c607a2460c5c6e3145229614a488463))

## [0.14.1](https://github.com/obviyus/HamVerBot/compare/v0.14.0...v0.14.1) (2024-03-23)


### Bug Fixes

* **results:** include meeting name in results ([2281c2c](https://github.com/obviyus/HamVerBot/commit/2281c2cee4c7ca985f097f5b963718fb79d2340f))

# [0.14.0](https://github.com/obviyus/HamVerBot/compare/v0.13.2...v0.14.0) (2024-03-09)


### Bug Fixes

* **db:** support Sprint Qualifying event ([fe124c2](https://github.com/obviyus/HamVerBot/commit/fe124c2e6edaa9032f12d8933dc9370c92f80ba8))
* **driver:** handle missing data in driver list ([5ddd3ef](https://github.com/obviyus/HamVerBot/commit/5ddd3efd066f478ee353faf03580196edaec5e21))
* **sqlx:** re-add cached query ([479c9d9](https://github.com/obviyus/HamVerBot/commit/479c9d9d459341e30b0e374e6853352ca3f8886e))
* **worker:** remove unn-necessary deref ([9b6b63e](https://github.com/obviyus/HamVerBot/commit/9b6b63e0fea4133cf69fc8a19708bca5e19fb78e))


### Features

* **db:** support sq ([71f2ac5](https://github.com/obviyus/HamVerBot/commit/71f2ac515967b82157f72e66add94857cbc34464))

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
