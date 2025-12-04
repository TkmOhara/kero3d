# kero3d

Vite + Docker による3Dフロントエンド開発環境

## 必要要件

- Docker
- Docker Compose

## セットアップ

### 1. プロジェクト構成

```
kero3d/
├── src/
│   └── main.js
├── public/
├── index.html
├── package.json
└── vite.config.js
```

### 2. 開発サーバーの起動

```bash
# 初回または依存関係変更時
docker-compose up --build

# 通常の開発時
docker-compose up
```

開発サーバーは http://localhost:5173 で起動します。

### 3. コンテナの停止

```bash
docker-compose down
```

## ローカル開発（Docker不使用）

```bash
pnpm install
pnpm run dev
```

## 依存関係の追加

1. `package.json` を編集
2. `pnpm install` でローカルに `pnpm-lock.yaml` を生成
3. `docker-compose up --build` で再ビルド
