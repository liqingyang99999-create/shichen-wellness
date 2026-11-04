param(
    [Parameter(Mandatory=$true)][string]$JavaHome,
    [Parameter(Mandatory=$true)][string]$SdkRoot
)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
if (!(Test-Path -LiteralPath (Join-Path $JavaHome 'bin/java.exe'))) { throw 'JDK 17 java.exe was not found.' }
if (!(Test-Path -LiteralPath (Join-Path $SdkRoot 'platforms/android-35/android.jar'))) { throw 'Install Android SDK Platform 35 first.' }
$previousJavaHome = $env:JAVA_HOME
try {
    $env:JAVA_HOME = (Resolve-Path -LiteralPath $JavaHome).Path
    $sdkForProperties = (Resolve-Path -LiteralPath $SdkRoot).Path.Replace('\','/').Replace(':','\:')
    Set-Content -LiteralPath (Join-Path $projectRoot 'local.properties') -Value "sdk.dir=$sdkForProperties" -Encoding ASCII
    Push-Location $projectRoot
    try {
        $metricTestDir = Join-Path $projectRoot 'build/metric-check'
        New-Item -ItemType Directory -Force -Path $metricTestDir | Out-Null
        & (Join-Path $JavaHome 'bin/javac.exe') -encoding UTF-8 -d $metricTestDir 'app/src/main/java/cn/shichen/wellness/ScreenTimeAccumulator.java' 'app/src/main/java/cn/shichen/wellness/StepSessionAccumulator.java' 'app/src/main/java/cn/shichen/wellness/NativeActionPolicy.java' 'tests/ScreenTimeAccumulatorCheck.java' 'tests/StepSessionAccumulatorCheck.java' 'tests/NativeActionPolicyCheck.java'
        if ($LASTEXITCODE -ne 0) { throw 'Metric checks failed to compile.' }
        & (Join-Path $JavaHome 'bin/java.exe') -cp $metricTestDir cn.shichen.wellness.ScreenTimeAccumulatorCheck
        if ($LASTEXITCODE -ne 0) { throw 'Screen duration checks failed.' }
        & (Join-Path $JavaHome 'bin/java.exe') -cp $metricTestDir cn.shichen.wellness.StepSessionAccumulatorCheck
        if ($LASTEXITCODE -ne 0) { throw 'Step session checks failed.' }
        & (Join-Path $JavaHome 'bin/java.exe') -cp $metricTestDir cn.shichen.wellness.NativeActionPolicyCheck
        if ($LASTEXITCODE -ne 0) { throw 'Native action policy checks failed.' }
        & (Join-Path $projectRoot 'gradlew.bat') --no-daemon assembleDebug lintDebug
        if ($LASTEXITCODE -ne 0) { throw "Android build failed: $LASTEXITCODE" }
    } finally { Pop-Location }
    Write-Output (Join-Path $projectRoot 'app/build/outputs/apk/debug/app-debug.apk')
} finally { $env:JAVA_HOME = $previousJavaHome }
