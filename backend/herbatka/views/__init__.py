from .tea_views import TeaList, TeaDetail
from .shop_views import ShopList, ShopDetail
from .user_views import UserList, UserDetail
from .tea_rating_views import TeaRatingList, TeaRatingDetail
from .tea_quality_views import TeaQualityList, TeaQualityDetail
from .tea_ingredient_views import TeaIngredientList, TeaIngredientDetail
from .tea_quality_assignment_views import (
    TeaQualityAssignmentList,
    TeaQualityAssignmentDetail,
)

__all__ = [
    TeaList,
    TeaDetail,
    ShopList,
    ShopDetail,
    UserList,
    UserDetail,
    TeaRatingList,
    TeaRatingDetail,
    TeaQualityList,
    TeaQualityDetail,
    TeaIngredientList,
    TeaIngredientDetail,
    TeaQualityAssignmentList,
    TeaQualityAssignmentDetail,
]
