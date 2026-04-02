# 物业成本管控平台（框架）

## 目录结构

- `server/`: Node.js（Express）+ MySQL + JWT
- `client/`: React + Ant Design + Vite

## 本地启动

### 1) 后端

```bash
cd server
npm i
cp .env.example .env
# 按需修改 .env 里的数据库配置
npm run dev
```

后端默认：`http://localhost:3001`

### 2) 前端

```bash
cd client
npm i
npm run dev
```

前端默认：`http://localhost:5173`

## 登录

- 前端登录页：`/login`
- 后端接口：`POST /api/auth/login`

