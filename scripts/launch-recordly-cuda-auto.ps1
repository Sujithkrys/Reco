param(
	[string]$AppPath,
	[string]$CudaScriptPath,
	[switch]$CloseExisting,
	[switch]$NoDiagnostics,
	[switch]$AllowCudaAudio
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $AppPath) {
	$packagedAppPath = Join-Path $repoRoot "release\win-unpacked\Reco.exe"
	$installedAppPath = Join-Path $env:LOCALAPPDATA "Programs\reco\Reco.exe"
	if (Test-Path $packagedAppPath) {
		$AppPath = $packagedAppPath
	} elseif (Test-Path $installedAppPath) {
		$AppPath = $installedAppPath
	} else {
		throw "Reco.exe was not found. Build the Windows package first or pass -AppPath."
	}
}

if (-not $CudaScriptPath) {
	$CudaScriptPath = Join-Path $repoRoot "electron\native\nvidia-cuda-compositor\run-mp4-pipeline.mjs"
}

if (-not (Test-Path $AppPath)) {
	throw "Reco app not found: $AppPath"
}

if (-not (Test-Path $CudaScriptPath)) {
	throw "NVIDIA CUDA/NVENC wrapper script not found: $CudaScriptPath"
}

$existingReco = @(Get-Process -Name "Reco" -ErrorAction SilentlyContinue)
if ($existingReco.Count -gt 0) {
	if (-not $CloseExisting) {
		Write-Host "Reco is already running. Close it first, or rerun with -CloseExisting so the CUDA env is inherited by the new app process."
		$existingReco | Select-Object Id, ProcessName, Path | Format-Table -AutoSize
		exit 2
	}

	$existingReco | Stop-Process -Force
	Start-Sleep -Milliseconds 500
}

$env:RECO_EXPERIMENTAL_NVIDIA_CUDA_EXPORT = "1"
$env:RECO_NVIDIA_CUDA_EXPORT_SCRIPT = (Resolve-Path $CudaScriptPath).Path
$env:RECO_NVIDIA_CUDA_EXPORT_HIGH_PRIORITY = "1"
$env:RECO_NVIDIA_CUDA_SAMPLE_GPU = "1"

if ($AllowCudaAudio) {
	$env:RECO_NVIDIA_CUDA_ALLOW_AUDIO_EXPORT = "1"
	Remove-Item Env:\RECO_NVIDIA_CUDA_FORCE_VIDEO_ONLY -ErrorAction SilentlyContinue
} else {
	Remove-Item Env:\RECO_NVIDIA_CUDA_ALLOW_AUDIO_EXPORT -ErrorAction SilentlyContinue
	$env:RECO_NVIDIA_CUDA_FORCE_VIDEO_ONLY = "1"
}

if ($NoDiagnostics) {
	Remove-Item Env:\RECO_NVIDIA_CUDA_EXPORT_DIAGNOSTICS -ErrorAction SilentlyContinue
} else {
	$env:RECO_NVIDIA_CUDA_EXPORT_DIAGNOSTICS = "1"
}

$resolvedAppPath = (Resolve-Path $AppPath).Path
$appDirectory = Split-Path $resolvedAppPath -Parent
if ($AllowCudaAudio) {
	$cudaAudioMode = "inline CUDA audio candidate; app still requires timestamp-aligned CUDA output"
} else {
	$cudaAudioMode = "CUDA video-only, then shared app audio mux"
}

Write-Host "Launching Reco with guarded NVIDIA CUDA/NVENC auto export enabled:"
Write-Host "  App: $resolvedAppPath"
Write-Host "  CUDA wrapper: $env:RECO_NVIDIA_CUDA_EXPORT_SCRIPT"
Write-Host "  Force CUDA video-only: $($env:RECO_NVIDIA_CUDA_FORCE_VIDEO_ONLY -eq '1')"
Write-Host "  CUDA audio exports: $cudaAudioMode"
Write-Host "  Diagnostics: $($env:RECO_NVIDIA_CUDA_EXPORT_DIAGNOSTICS -eq '1')"

Start-Process -FilePath $resolvedAppPath -WorkingDirectory $appDirectory
