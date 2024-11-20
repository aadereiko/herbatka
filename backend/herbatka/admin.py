from django.contrib import admin

# Register your models here.

from django.contrib import admin

from .models import Shop, TeaIngredient, Tea, User, TeaRating, TeaQuality, TeaQualityAssignment

admin.site.register(Shop)
admin.site.register(TeaIngredient)
admin.site.register(Tea)
admin.site.register(User)
admin.site.register(TeaRating)
admin.site.register(TeaQuality)
admin.site.register(TeaQualityAssignment)

