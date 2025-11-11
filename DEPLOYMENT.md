# Deployment Guide

This guide covers deploying the Actual-Analytics application across Cloudflare Pages and Railway.

## Architecture

- **Frontend**: Cloudflare Pages (Next.js)
- **Backend**: Railway (Node.js/Express)
- **Database**: Railway PostgreSQL
- **Data Ingestion**: GitHub Actions (scheduled)

## Step 1: Deploy Backend to Railway

1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Initialize Railway project**:
   ```bash
   cd backend
   railway init
   ```

4. **Add PostgreSQL plugin**:
   - Go to Railway dashboard
   - Click "Add Service" → "PostgreSQL"
   - Railway automatically sets `DATABASE_URL` environment variable

5. **Deploy**:
   ```bash
   railway up
   ```

6. **Get your backend URL**:
   - From Railway dashboard, copy the service URL
   - Example: `https://actual-analytics-api.up.railway.app`

## Step 2: Deploy Frontend to Cloudflare Pages

1. **Cloudflare Pages** is already connected to your GitHub repo

2. **Update Cloudflare Pages settings**:
   - **Build command**: `npm run build`
   - **Build output directory**: `.next`
   - **Root directory**: `frontend`
   - **Environment variables**:
     - `NEXT_PUBLIC_API_URL`: Your Railway backend URL (e.g., `https://actual-analytics-api.up.railway.app`)

3. **Deploy**:
   - Push to GitHub and Cloudflare will auto-deploy

## Step 3: Set Up GitHub Actions for Data Ingestion

1. **Add secrets to GitHub**:
   - Go to your repository settings → Secrets
   - Add `DB_PASSWORD`: Your PostgreSQL password

2. **Add environment variable to GitHub Actions**:
   - Update `.github/workflows/daily-ingestion.yml` with your Railway PostgreSQL connection string

3. **Configure the workflow**:
   - The workflow runs daily at 2 AM UTC
   - Adjust the cron schedule in `.github/workflows/daily-ingestion.yml` as needed
   - Or manually trigger by going to Actions → Daily Data Ingestion → Run workflow

## Local Development

1. **Start PostgreSQL**:
   ```bash
   docker-compose up -d
   ```

2. **Backend**:
   ```bash
   cd backend
   npm install
   npm run dev
   ```

3. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Load data**:
   ```bash
   cd ingest
   python fetch_and_load.py 2024
   python load_pbp.py 2024
   python calculate_medians.py 2024
   ```

## Environment Variables

### Frontend (`.env.local`)
```
NEXT_PUBLIC_API_URL=https://your-railway-backend.up.railway.app
```

### Backend (Railway)
- `DATABASE_URL`: Auto-set by Railway PostgreSQL plugin
- `PORT`: Auto-set to 3000

## Monitoring

- **Cloudflare Pages**: Deployments → Deployment status
- **Railway**: Dashboard → Services → Logs
- **GitHub Actions**: Actions → Daily Data Ingestion → Workflow runs

## Troubleshooting

**Frontend can't reach backend**:
- Check `NEXT_PUBLIC_API_URL` environment variable in Cloudflare Pages
- Verify CORS settings in backend (`backend/src/routes/players.js`)

**Data ingestion failing**:
- Check GitHub Actions logs
- Verify `DB_PASSWORD` secret is set correctly
- Ensure Railway PostgreSQL is running

**Build failing on Cloudflare**:
- Check build logs in Cloudflare Pages
- Verify root directory is set to `frontend`
- Run `npm run build` locally to test
