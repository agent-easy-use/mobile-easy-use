#!/usr/bin/env ruby

require 'xcodeproj'
require 'fileutils'

root = File.expand_path(__dir__)
project_path = File.join(root, 'ApiDemo.xcodeproj')
FileUtils.rm_rf(project_path)

project = Xcodeproj::Project.new(project_path)
project.root_object.attributes['LastSwiftUpdateCheck'] = '2600'
project.root_object.attributes['LastUpgradeCheck'] = '2600'

project.build_configurations.each do |configuration|
  configuration.name = 'ProbeDebug' if configuration.name == 'Debug'
end

target = project.new_target(:application, 'ApiDemo', :ios, '14.0')
target.build_configurations.each do |configuration|
  configuration.name = 'ProbeDebug' if configuration.name == 'Debug'
  settings = configuration.build_settings
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.agenteasyuse.mobileeasyuse.apidemo.ios'
  settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  settings['INFOPLIST_FILE'] = 'ApiDemo/Support/Info.plist'
  settings['CODE_SIGN_STYLE'] = 'Automatic'
  settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  settings['CLANG_ENABLE_MODULES'] = 'YES'
  settings['CLANG_ENABLE_OBJC_ARC'] = 'YES'
  settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = ''
  settings['CURRENT_PROJECT_VERSION'] = '1'
  settings['MARKETING_VERSION'] = '1.0'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = '14.0'
end

app_group = project.main_group.new_group('ApiDemo', 'ApiDemo')
Dir.glob(File.join(root, 'ApiDemo', '**', '*.{h,m,swift}')).sort.each do |source_path|
  relative = source_path.delete_prefix(File.join(root, 'ApiDemo') + '/')
  components = relative.split('/')
  file_name = components.pop
  group = components.reduce(app_group) do |current, component|
    current.groups.find { |child| child.display_name == component } || current.new_group(component, component)
  end
  reference = group.new_file(file_name)
  target.add_file_references([reference]) if ['.m', '.swift'].include?(File.extname(file_name))
end

['UIKit.framework', 'Foundation.framework'].each do |framework_name|
  reference = project.frameworks_group.new_file("System/Library/Frameworks/#{framework_name}")
  target.frameworks_build_phase.add_file_reference(reference, true)
end

project.save
project.recreate_user_schemes

scheme_path = File.join(project_path, 'xcshareddata', 'xcschemes')
FileUtils.mkdir_p(scheme_path)
user_scheme = Dir.glob(File.join(project_path, 'xcuserdata', '**', 'xcschemes', 'ApiDemo.xcscheme')).first
FileUtils.cp(user_scheme, File.join(scheme_path, 'ApiDemo.xcscheme')) if user_scheme

puts "Generated #{project_path}"
