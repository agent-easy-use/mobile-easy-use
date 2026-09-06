Pod::Spec.new do |spec|
  spec.name = 'MobileEasyUse'
  spec.version = '0.1.0'
  spec.summary = 'Internal iOS App integration for mobile-easy-use.'
  spec.description = <<-DESC
    Prebuilt Objective-C bridge and LLDB-loaded runtime dylibs for internal
    mobile-easy-use test builds. The Pod provides resources and links no App code.
  DESC
  spec.homepage = 'https://github.com/mobile-easy-use/mobile-easy-use'
  spec.license = { :type => 'Proprietary', :text => 'Internal test integration only.' }
  spec.author = { 'MobileEasyUse' => 'mobile-easy-use' }
  spec.source = {
    :git => 'https://github.com/mobile-easy-use/mobile-easy-use.git',
    :tag => spec.version.to_s
  }

  spec.platform = :ios, '14.0'

  # Both dylibs are embedded by the App build hook but intentionally remain outside
  # the App's startup link graph. LLDB loads MobileEasyUse.dylib after attaching;
  # dyld then loads its MobileEasyUseRuntime.dylib dependency.
  spec.preserve_paths = [
    'integration/ios/Binaries/**/*',
    'integration/ios/MobileEasyUseRuntime.config',
    'integration/ios/Sources/**/*',
    'integration/ios/Scripts/build-mobile-easy-use.sh',
    'integration/ios/Scripts/embed-mobile-easy-use.sh',
    'integration/ios/FRIDA_VERSION',
    'integration/ios/THIRD_PARTY_NOTICES.md'
  ]
end
