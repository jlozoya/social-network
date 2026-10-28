param(
  [Parameter(Mandatory = $true)][string]$InputBundle,
  [Parameter(Mandatory = $true)][string]$OutputBundle
)
$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$signingRoot = Join-Path $repoRoot '.android-signing'
$storeFile = Join-Path $signingRoot 'social-network-upload.jks'
$passwordFile = Join-Path $signingRoot 'upload-password.dpapi'
$jdkBin = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin' } else { 'C:/Program Files/Android/Android Studio/jbr/bin' }
$jarsigner = Join-Path $jdkBin 'jarsigner.exe'
if (!(Test-Path -LiteralPath $jarsigner)) { throw 'Configura JAVA_HOME con un JDK que incluya jarsigner.' }
if (!(Test-Path -LiteralPath $storeFile) -or !(Test-Path -LiteralPath $passwordFile)) { throw 'Falta la clave de carga local o su contraseña cifrada.' }
$source = (Resolve-Path -LiteralPath $InputBundle).Path
$destination = [System.IO.Path]::GetFullPath($OutputBundle)
if ($source -eq $destination) { throw 'Usa una salida distinta para conservar el AAB original.' }
if (Test-Path -LiteralPath $destination) { throw 'La salida ya existe; se conserva sin sustituirla.' }
New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
Copy-Item -LiteralPath $source -Destination $destination
$unsealed = [System.Security.Cryptography.ProtectedData]::Unprotect([System.IO.File]::ReadAllBytes($passwordFile), $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
$env:SOCIAL_NETWORK_UPLOAD_STOREPASS = [System.Text.Encoding]::UTF8.GetString($unsealed)
try {
  & $jarsigner -keystore $storeFile -storepass:env SOCIAL_NETWORK_UPLOAD_STOREPASS -keypass:env SOCIAL_NETWORK_UPLOAD_STOREPASS -digestalg SHA-256 -sigalg SHA256withRSA $destination social-network-upload
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo firmar el AAB.' }
  & $jarsigner -verify $destination
  if ($LASTEXITCODE -ne 0) { throw 'La firma del AAB no se pudo verificar.' }
  Get-FileHash -LiteralPath $destination -Algorithm SHA256
} finally {
  Remove-Item Env:SOCIAL_NETWORK_UPLOAD_STOREPASS -ErrorAction SilentlyContinue
  [Array]::Clear($unsealed, 0, $unsealed.Length)
}
