from .tea_views import TeaList, TeaDetail, TeaSearch
from .shop_views import ShopList, ShopDetail
from .user_views import UserList, UserDetail
from .tea_rating_views import TeaRatingList, TeaRatingDetail, TeaRatingStats
from .tea_quality_views import TeaQualityList, TeaQualityDetail
from .tea_ingredient_views import TeaIngredientList, TeaIngredientDetail
from .tea_quality_assignment_views import (
    TeaQualityAssignmentList,
    TeaQualityAssignmentDetail,
)
from .tea_consumption_views import TeaConsumptionList, TeaConsumptionDetail, TeaConsumptionStats

__all__ = [
    TeaList,
    TeaDetail,
    TeaSearch,
    ShopList,
    ShopDetail,
    UserList,
    UserDetail,
    TeaRatingList,
    TeaRatingDetail,
    TeaRatingStats,
    TeaQualityList,
    TeaQualityDetail,
    TeaIngredientList,
    TeaIngredientDetail,
    TeaQualityAssignmentList,
    TeaQualityAssignmentDetail,
    TeaConsumptionList,
    TeaConsumptionDetail,
    TeaConsumptionStats,
]
