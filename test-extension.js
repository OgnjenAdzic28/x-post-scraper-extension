#!/usr/bin/env node

// Simple test script to validate Chrome extension structure
const fs = require('fs');
const path = require('path');

class ExtensionValidator {
  constructor(extensionPath) {
    this.extensionPath = extensionPath;
    this.errors = [];
    this.warnings = [];
  }

  validateManifest() {
    console.log('🔍 Validating manifest.json...');
    
    const manifestPath = path.join(this.extensionPath, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
      this.errors.push('manifest.json not found');
      return;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      // Check required fields
      const requiredFields = ['manifest_version', 'name', 'version'];
      requiredFields.forEach(field => {
        if (!manifest[field]) {
          this.errors.push(`Missing required field: ${field}`);
        }
      });

      // Check manifest version
      if (manifest.manifest_version !== 3) {
        this.warnings.push('Using Manifest V2 (V3 recommended)');
      }

      // Check permissions
      if (!manifest.permissions || !Array.isArray(manifest.permissions)) {
        this.warnings.push('No permissions specified');
      }

      // Check content scripts
      if (!manifest.content_scripts || !Array.isArray(manifest.content_scripts)) {
        this.errors.push('No content scripts specified');
      }

      console.log('✅ Manifest validation complete');
      
    } catch (error) {
      this.errors.push(`Invalid JSON in manifest.json: ${error.message}`);
    }
  }

  validateFiles() {
    console.log('🔍 Validating required files...');
    
    const requiredFiles = [
      'popup/popup.html',
      'popup/popup.js',
      'content/content.js',
      'background/background.js'
    ];

    requiredFiles.forEach(file => {
      const filePath = path.join(this.extensionPath, file);
      if (!fs.existsSync(filePath)) {
        this.errors.push(`Required file missing: ${file}`);
      } else {
        console.log(`✅ Found: ${file}`);
      }
    });
  }

  validatePopupHTML() {
    console.log('🔍 Validating popup HTML...');
    
    const popupPath = path.join(this.extensionPath, 'popup/popup.html');
    
    if (!fs.existsSync(popupPath)) {
      return; // Already reported in validateFiles
    }

    const content = fs.readFileSync(popupPath, 'utf8');
    
    // Check for required elements
    const requiredElements = [
      'startBtn',
      'stopBtn',
      'downloadBtn',
      'status',
      'progressFill'
    ];

    requiredElements.forEach(id => {
      if (!content.includes(`id="${id}"`)) {
        this.warnings.push(`Missing element with id: ${id}`);
      }
    });

    console.log('✅ Popup HTML validation complete');
  }

  validateJavaScript() {
    console.log('🔍 Validating JavaScript files...');
    
    const jsFiles = [
      'popup/popup.js',
      'content/content.js',
      'background/background.js'
    ];

    jsFiles.forEach(file => {
      const filePath = path.join(this.extensionPath, file);
      
      if (!fs.existsSync(filePath)) {
        return; // Already reported
      }

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Basic syntax check (very simple)
        if (content.includes('chrome.runtime') || content.includes('chrome.tabs')) {
          console.log(`✅ ${file} appears to use Chrome APIs correctly`);
        }
        
        // Check for common patterns
        if (file === 'content/content.js') {
          if (!content.includes('querySelector') && !content.includes('querySelectorAll')) {
            this.warnings.push('Content script may not be interacting with DOM');
          }
        }
        
      } catch (error) {
        this.errors.push(`Error reading ${file}: ${error.message}`);
      }
    });
  }

  validateIcons() {
    console.log('🔍 Validating icons...');
    
    const iconSizes = ['16', '48', '128'];
    
    iconSizes.forEach(size => {
      const iconPath = path.join(this.extensionPath, `icons/icon${size}.png`);
      if (!fs.existsSync(iconPath)) {
        this.warnings.push(`Missing icon: icon${size}.png`);
      }
    });
  }

  validatePermissions() {
    console.log('🔍 Validating permissions...');
    
    const manifestPath = path.join(this.extensionPath, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
      return;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      // Check for required permissions
      const requiredPermissions = ['activeTab', 'storage', 'downloads'];
      const hasPermissions = manifest.permissions || [];
      
      requiredPermissions.forEach(perm => {
        if (!hasPermissions.includes(perm)) {
          this.warnings.push(`Missing recommended permission: ${perm}`);
        }
      });

      // Check host permissions for X
      const hostPermissions = manifest.host_permissions || [];
      const hasXPermission = hostPermissions.some(perm => 
        perm.includes('x.com') || perm.includes('twitter.com')
      );
      
      if (!hasXPermission) {
        this.errors.push('Missing host permissions for x.com or twitter.com');
      }

    } catch (error) {
      // Already handled in validateManifest
    }
  }

  run() {
    console.log('🚀 Starting Chrome Extension Validation\n');
    console.log(`Extension path: ${this.extensionPath}\n`);

    this.validateManifest();
    this.validateFiles();
    this.validatePopupHTML();
    this.validateJavaScript();
    this.validateIcons();
    this.validatePermissions();

    console.log('\n📊 Validation Results:');
    console.log('='.repeat(50));

    if (this.errors.length === 0) {
      console.log('✅ No critical errors found!');
    } else {
      console.log(`❌ ${this.errors.length} error(s) found:`);
      this.errors.forEach(error => console.log(`   • ${error}`));
    }

    if (this.warnings.length === 0) {
      console.log('✅ No warnings!');
    } else {
      console.log(`⚠️  ${this.warnings.length} warning(s):`);
      this.warnings.forEach(warning => console.log(`   • ${warning}`));
    }

    console.log('\n📋 Next Steps:');
    if (this.errors.length === 0) {
      console.log('1. Load the extension in Chrome (chrome://extensions/)');
      console.log('2. Enable Developer Mode');
      console.log('3. Click "Load unpacked" and select this folder');
      console.log('4. Test on an X profile page');
    } else {
      console.log('1. Fix the errors listed above');
      console.log('2. Run this validator again');
      console.log('3. Load the extension once all errors are resolved');
    }

    return this.errors.length === 0;
  }
}

// Run validation
const extensionPath = process.argv[2] || '.';
const validator = new ExtensionValidator(extensionPath);
const isValid = validator.run();

process.exit(isValid ? 0 : 1);
