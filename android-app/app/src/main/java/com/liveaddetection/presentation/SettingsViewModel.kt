package com.liveaddetection.presentation

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Settings ViewModel Implementation
 * Single Responsibility: Manage app settings
 */
class SettingsViewModel : ViewModel(), ISettingsViewModel {

    private val _settings = MutableLiveData(ISettingsViewModel.Settings())

    override fun getSettings(): LiveData<ISettingsViewModel.Settings> = _settings

    override suspend fun updateSettings(settings: ISettingsViewModel.Settings) {
        viewModelScope.launch(Dispatchers.IO) {
            // In a real app, persist to SharedPreferences or DataStore
            _settings.postValue(settings)
        }
    }

    override suspend fun resetToDefaults() {
        viewModelScope.launch(Dispatchers.IO) {
            _settings.postValue(ISettingsViewModel.Settings())
        }
    }
}
